import { uploadReceiptAction } from "@/app/actions";
import { getReceiptFileErrorMessage, prepareReceiptFile } from "@/lib/image";
import { validateReceiptFileBeforePreparation } from "@/lib/receipt-file-selection";
import { validateReceiptFile } from "@/lib/receipt-upload";

export type ReceiptUploadStatus = "idle" | "preparing" | "uploading" | "done" | "error";
export type ReceiptUploadState = {
  file: File | null;
  status: ReceiptUploadStatus;
  error: string | null;
};
export type ReceiptUploadResult = { filePath: string; error?: never } | { error: string; filePath?: never };

const UPLOAD_SESSION_CANCELED_ERROR = "アップロードはキャンセルされました";

/** External store keeps the upload lifecycle directly testable without a DOM. */
export function createReceiptUploadController() {
  let state: ReceiptUploadState = { file: null, status: "idle", error: null };
  let generation = 0;
  const listeners = new Set<() => void>();
  const isBusy = (): boolean => state.status === "preparing" || state.status === "uploading";
  const update = (next: ReceiptUploadState): void => {
    state = next;
    listeners.forEach((listener) => listener());
  };
  const fail = (error: string): ReceiptUploadResult => {
    update({ ...state, status: "error", error });
    return { error };
  };

  return {
    getSnapshot: (): ReceiptUploadState => state,
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    setFile: (file: File | null): void => {
      if (file === null) {
        generation += 1;
        update({ file: null, status: "idle", error: null });
        return;
      }
      if (isBusy()) return;
      const error = validateReceiptFileBeforePreparation(file);
      if (error) { fail(error); return; }
      generation += 1;
      update({ file, status: "idle", error: null });
    },
    upload: async (): Promise<ReceiptUploadResult> => {
      if (isBusy()) return { error: "アップロード中です。しばらくお待ちください。" };
      const uploadGeneration = generation;
      const file = state.file;
      if (!file) return fail("ファイルを選択してください");
      const error = validateReceiptFileBeforePreparation(file);
      if (error) return fail(error);
      update({ ...state, status: "preparing", error: null });
      try {
        const preparedFile = await prepareReceiptFile(file);
        if (uploadGeneration !== generation) return { error: UPLOAD_SESSION_CANCELED_ERROR };
        const preparedError = validateReceiptFile(preparedFile);
        if (preparedError) return fail(preparedError);
        const formData = new FormData();
        formData.append("file", preparedFile);
        update({ ...state, status: "uploading" });
        if (uploadGeneration !== generation) return { error: UPLOAD_SESSION_CANCELED_ERROR };
        const result = await uploadReceiptAction(formData);
        if (uploadGeneration !== generation) return { error: UPLOAD_SESSION_CANCELED_ERROR };
        if (result.error) return fail(result.error);
        if (!result.filePath) return fail("書類のアップロードに失敗しました");
        update({ ...state, status: "done", error: null });
        if (uploadGeneration !== generation) return { error: UPLOAD_SESSION_CANCELED_ERROR };
        return { filePath: result.filePath };
      } catch (error) {
        if (uploadGeneration !== generation) return { error: UPLOAD_SESSION_CANCELED_ERROR };
        return fail(getReceiptFileErrorMessage(error, "書類のアップロード中にエラーが発生しました"));
      }
    },
  };
}
