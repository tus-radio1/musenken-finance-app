import {
  isAllowedReceiptMimeType,
  RECEIPT_TYPE_ERROR_MESSAGE,
  validateReceiptFile,
} from "@/lib/receipt-upload";

export const MULTIPLE_RECEIPT_FILES_MESSAGE =
  "ファイルは1つずつ選択してください。複数のファイルは追加されませんでした。";

/**
 * Check files before preparation. PDFs are uploaded unchanged, while images
 * are compressed and checked against the size limit after preparation.
 */
export function validateReceiptFileBeforePreparation(file: File): string | null {
  if (file.type === "") return null;
  if (file.type === "application/pdf") return validateReceiptFile(file);
  return isAllowedReceiptMimeType(file.type) ? null : RECEIPT_TYPE_ERROR_MESSAGE;
}

export function selectReceiptFile(files: ArrayLike<File>):
  | { file: File | null; error: null }
  | { file: null; error: string } {
  if (files.length > 1) return { file: null, error: MULTIPLE_RECEIPT_FILES_MESSAGE };
  const file = files[0] ?? null;
  const error = file ? validateReceiptFileBeforePreparation(file) : null;
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
