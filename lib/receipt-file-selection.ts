import { validateReceiptFile } from "@/lib/receipt-upload";

export const MULTIPLE_RECEIPT_FILES_MESSAGE =
  "ファイルは1つずつ選択してください。複数のファイルは追加されませんでした。";

export function selectReceiptFile(files: ArrayLike<File>):
  | { file: File | null; error: null }
  | { file: null; error: string } {
  if (files.length > 1) return { file: null, error: MULTIPLE_RECEIPT_FILES_MESSAGE };
  const file = files[0] ?? null;
  const error = file ? validateReceiptFile(file) : null;
  return error ? { file: null, error } : { file, error: null };
}

export function isFileDrag(dataTransfer: Pick<DataTransfer, "types"> | null): boolean {
  return dataTransfer !== null && Array.from(dataTransfer.types).includes("Files");
}

export function isFilePickerKey(key: string): boolean {
  return key === "Enter" || key === " ";
}

/** Only file navigation is suppressed; text and in-app drag interactions continue. */
export function preventFileNavigation(event: DragEvent): void {
  if (isFileDrag(event.dataTransfer)) event.preventDefault();
}
