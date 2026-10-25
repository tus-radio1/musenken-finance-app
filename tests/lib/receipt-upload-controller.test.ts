import { beforeEach, describe, expect, it, vi } from "vitest";
import { uploadReceiptAction, discardReceiptUpload } from "@/app/actions";
import { prepareReceiptFile, ReceiptFileError } from "@/lib/image";
import { createReceiptUploadController, type ReceiptUploadStatus } from "@/lib/receipt-upload-controller";
import { selectReceiptFile } from "@/lib/receipt-file-selection";
import { MAX_RECEIPT_FILE_SIZE_BYTES, RECEIPT_TYPE_ERROR_MESSAGE } from "@/lib/receipt-upload";

vi.mock("@/app/actions", () => ({ uploadReceiptAction: vi.fn(), discardReceiptUpload: vi.fn() }));
vi.mock("@/lib/image", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/image")>(),
  prepareReceiptFile: vi.fn(),
}));

const pdf = (): File => new File(["receipt"], "receipt.pdf", { type: "application/pdf" });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(discardReceiptUpload).mockResolvedValue({ success: true });
  vi.mocked(prepareReceiptFile).mockImplementation(async (file) => file);
  vi.mocked(uploadReceiptAction).mockResolvedValue({ success: true, filePath: "member/receipt.pdf" });
});

describe("useReceiptUpload controller", () => {
  it("prepares and uploads only on submission, exposing idle → preparing → uploading → done", async () => {
    const controller = createReceiptUploadController();
    const statuses: ReceiptUploadStatus[] = [controller.getSnapshot().status];
    controller.subscribe(() => statuses.push(controller.getSnapshot().status));
    const original = pdf();
    const prepared = new File(["prepared"], "prepared.pdf", { type: "application/pdf" });
    vi.mocked(prepareReceiptFile).mockResolvedValue(prepared);
    controller.setFile(original);
    expect(uploadReceiptAction).not.toHaveBeenCalled();

    const result = await controller.upload();

    expect(result).toEqual({ filePath: "member/receipt.pdf" });
    expect(statuses).toEqual(["idle", "idle", "preparing", "uploading", "done"]);
    const form = vi.mocked(uploadReceiptAction).mock.calls[0][0];
    expect(Array.from(form.keys())).toEqual(["file"]);
    expect(form.get("file")).toBe(prepared);
  });

  it("clears the selected file and errors with the remove action", async () => {
    const controller = createReceiptUploadController();
    controller.setFile(pdf());
    vi.mocked(uploadReceiptAction).mockResolvedValue({ error: "送信に失敗しました" });
    await controller.upload();

    controller.setFile(null);

    expect(controller.getSnapshot()).toEqual({ file: null, status: "idle", error: null });
    expect(await controller.upload()).toEqual({ error: "ファイルを選択してください" });
    expect(uploadReceiptAction).toHaveBeenCalledTimes(1);
  });

  it("replaces the selected file without uploading", () => {
    const controller = createReceiptUploadController();
    controller.setFile(pdf());
    const replacement = pdf();
    controller.setFile(replacement);
    expect(controller.getSnapshot().file).toBe(replacement);
    expect(uploadReceiptAction).not.toHaveBeenCalled();
  });

  it("rejects invalid input before preparation and retains the previous file", () => {
    const controller = createReceiptUploadController();
    const previous = pdf();
    controller.setFile(previous);
    controller.setFile(new File(["bad"], "bad.html", { type: "text/html" }));
    expect(controller.getSnapshot()).toEqual({ file: previous, status: "error", error: RECEIPT_TYPE_ERROR_MESSAGE });
    expect(prepareReceiptFile).not.toHaveBeenCalled();
  });

  it("shows preparation errors inline and never calls the server action", async () => {
    const controller = createReceiptUploadController();
    controller.setFile(pdf());
    vi.mocked(prepareReceiptFile).mockRejectedValue(new ReceiptFileError("画像を読み込めませんでした"));
    expect(await controller.upload()).toEqual({ error: "画像を読み込めませんでした" });
    expect(controller.getSnapshot().status).toBe("error");
    expect(uploadReceiptAction).not.toHaveBeenCalled();
  });

  it("validates prepared output before upload", async () => {
    const controller = createReceiptUploadController();
    controller.setFile(pdf());
    vi.mocked(prepareReceiptFile).mockResolvedValue(new File(["bad"], "bad.svg", { type: "image/svg+xml" }));
    expect(await controller.upload()).toEqual({ error: RECEIPT_TYPE_ERROR_MESSAGE });
    expect(uploadReceiptAction).not.toHaveBeenCalled();
  });

  it("reports server errors and permits retry", async () => {
    const controller = createReceiptUploadController();
    const states: ReceiptUploadStatus[] = [];
    controller.subscribe(() => states.push(controller.getSnapshot().status));
    controller.setFile(pdf());
    vi.mocked(uploadReceiptAction).mockResolvedValueOnce({ error: "アップロード回数の上限です" });
    expect(await controller.upload()).toEqual({ error: "アップロード回数の上限です" });
    expect(controller.getSnapshot().error).toBe("アップロード回数の上限です");
    expect(states).toEqual(["idle", "preparing", "uploading", "error"]);
    expect(await controller.upload()).toEqual({ filePath: "member/receipt.pdf" });
    expect(controller.getSnapshot().error).toBeNull();
  });

  it("resets the upload session and ignores a late failure from the previous file", async () => {
    const controller = createReceiptUploadController();
    const firstFile = pdf();
    const nextFile = new File(["next"], "next.pdf", { type: "application/pdf" });
    controller.setFile(firstFile);

    let finishUpload!: (result: Awaited<ReturnType<typeof uploadReceiptAction>>) => void;
    vi.mocked(uploadReceiptAction).mockImplementation(() => new Promise((resolve) => {
      finishUpload = resolve;
    }));
    const pendingUpload = controller.upload();
    await vi.waitFor(() => expect(uploadReceiptAction).toHaveBeenCalledTimes(1));

    controller.setFile(null);
    expect(controller.getSnapshot()).toEqual({ file: null, status: "idle", error: null });
    controller.setFile(nextFile);
    finishUpload({ error: "前の書類のアップロードに失敗しました" });
    await pendingUpload;

    expect(controller.getSnapshot()).toEqual({ file: nextFile, status: "idle", error: null });
  });

  it("allows oversized images through selection and checks size after compression", async () => {
    const largeImage = new File(
      [new Uint8Array(MAX_RECEIPT_FILE_SIZE_BYTES + 1)],
      "large.jpg",
      { type: "image/jpeg" },
    );
    const compressedImage = new File(["small"], "large.webp", { type: "image/webp" });
    expect(selectReceiptFile([largeImage])).toEqual({ file: largeImage, error: null });

    const controller = createReceiptUploadController();
    vi.mocked(prepareReceiptFile).mockResolvedValue(compressedImage);
    controller.setFile(largeImage);

    expect(await controller.upload()).toEqual({ filePath: "member/receipt.pdf" });
    expect(prepareReceiptFile).toHaveBeenCalledWith(largeImage);
    expect(uploadReceiptAction).toHaveBeenCalledTimes(1);
  });

  it("defers empty MIME type validation until HEIC preparation", async () => {
    const heic = new File(["raw heic"], "receipt.heic", { type: "" });
    const converted = new File(["jpeg"], "receipt.jpg", { type: "image/jpeg" });
    expect(selectReceiptFile([heic])).toEqual({ file: heic, error: null });

    const controller = createReceiptUploadController();
    vi.mocked(prepareReceiptFile).mockResolvedValue(converted);
    controller.setFile(heic);

    expect(await controller.upload()).toEqual({ filePath: "member/receipt.pdf" });
    expect(prepareReceiptFile).toHaveBeenCalledWith(heic);
    expect(uploadReceiptAction).toHaveBeenCalledTimes(1);
  });

  it("converts network failures to a Japanese error", async () => {
    const controller = createReceiptUploadController();
    controller.setFile(pdf());
    vi.mocked(uploadReceiptAction).mockRejectedValue(new Error("network details"));
    expect(await controller.upload()).toEqual({ error: "書類のアップロード中にエラーが発生しました" });
    expect(controller.getSnapshot().status).toBe("error");
  });

  it("does not accept replacement files or a second upload during preparation or upload", async () => {
    const controller = createReceiptUploadController();
    const file = pdf();
    controller.setFile(file);
    let finishPreparation!: (file: File) => void;
    let finishUpload!: (result: { success: boolean; filePath: string }) => void;
    vi.mocked(prepareReceiptFile).mockImplementation(() => new Promise((resolve) => { finishPreparation = resolve; }));
    vi.mocked(uploadReceiptAction).mockImplementation(() => new Promise((resolve) => { finishUpload = resolve; }));
    const pending = controller.upload();
    expect(controller.getSnapshot().status).toBe("preparing");
    controller.setFile(pdf());
    expect(controller.getSnapshot().file).toBe(file);
    expect(await controller.upload()).toHaveProperty("error");
    finishPreparation(file);
    await Promise.resolve();
    expect(controller.getSnapshot().status).toBe("uploading");
    controller.setFile(pdf());
    expect(controller.getSnapshot().file).toBe(file);
    expect(await controller.upload()).toHaveProperty("error");
    finishUpload({ success: true, filePath: "member/receipt.pdf" });
    await pending;
    expect(uploadReceiptAction).toHaveBeenCalledTimes(1);
  });

  it("unsubscribes store listeners on cleanup", () => {
    const controller = createReceiptUploadController();
    const listener = vi.fn();
    const cleanup = controller.subscribe(listener);
    cleanup();
    controller.setFile(pdf());
    expect(listener).not.toHaveBeenCalled();
  });
});


describe("receipt upload cleanup lifecycle", () => {
  it("cleans up a successful upload arriving after cancellation", async () => {
    const controller = createReceiptUploadController();
    controller.setFile(pdf());
    let finish!: (result: { success: true; filePath: string }) => void;
    vi.mocked(uploadReceiptAction).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const pending = controller.upload();
    await vi.waitFor(() => expect(uploadReceiptAction).toHaveBeenCalled());
    controller.cancel();
    finish({ success: true, filePath: "member/late.pdf" });
    expect(await pending).toHaveProperty("error");
    expect(discardReceiptUpload).toHaveBeenCalledWith("member/late.pdf");
  });

  it("defers cancel cleanup until the in-flight save finishes", async () => {
    const controller = createReceiptUploadController();
    controller.setFile(pdf());
    let finishSave!: () => void;
    const saving = controller.withSubmission(async () => {
      await controller.upload();
      await new Promise<void>((resolve) => { finishSave = resolve; });
    });
    await vi.waitFor(() => expect(controller.getSnapshot().status).toBe("done"));
    controller.cancel();
    expect(discardReceiptUpload).not.toHaveBeenCalled();
    finishSave();
    await saving;
    expect(discardReceiptUpload).toHaveBeenCalledWith("member/receipt.pdf");
  });

  it("cleans uploads on save rejection", async () => {
    const controller = createReceiptUploadController();
    controller.setFile(pdf());
    await expect(controller.withSubmission(async () => {
      await controller.upload();
      throw new Error("save failed");
    })).rejects.toThrow("save failed");
    expect(discardReceiptUpload).toHaveBeenCalledWith("member/receipt.pdf");
  });
});
