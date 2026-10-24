import { describe, expect, it, vi } from "vitest";
import { isFileDrag, isFilePickerKey, MULTIPLE_RECEIPT_FILES_MESSAGE, preventFileNavigation, selectReceiptFile } from "@/lib/receipt-file-selection";
import { MAX_RECEIPT_FILE_SIZE_BYTES, RECEIPT_SIZE_ERROR_MESSAGE, RECEIPT_TYPE_ERROR_MESSAGE } from "@/lib/receipt-upload";

const pdf = (): File => new File(["receipt"], "receipt.pdf", { type: "application/pdf" });

describe("receipt selection", () => {
  it("accepts exactly one file from a picker or drop", () => {
    const file = pdf();
    expect(selectReceiptFile({ 0: file, length: 1 })).toEqual({ file, error: null });
  });

  it("rejects the entire batch when multiple files are dropped", () => {
    expect(selectReceiptFile([pdf(), pdf()])).toEqual({ file: null, error: MULTIPLE_RECEIPT_FILES_MESSAGE });
  });

  it("does not select a file when the picker is cancelled", () => {
    expect(selectReceiptFile([])).toEqual({ file: null, error: null });
  });

  it("rejects unsupported types with the shared Japanese message", () => {
    const file = new File(["html"], "receipt.html", { type: "text/html" });
    expect(selectReceiptFile([file])).toEqual({ file: null, error: RECEIPT_TYPE_ERROR_MESSAGE });
  });

  it("rejects files over 10MB with the shared Japanese message", () => {
    const file = new File([new Uint8Array(MAX_RECEIPT_FILE_SIZE_BYTES + 1)], "large.pdf", { type: "application/pdf" });
    expect(selectReceiptFile([file])).toEqual({ file: null, error: RECEIPT_SIZE_ERROR_MESSAGE });
  });

  it.each(["Enter", " "])("recognizes %j for native picker activation", (key) => {
    expect(isFilePickerKey(key)).toBe(true);
  });

  it.each(["Escape", "Tab", "a"])("leaves %j to the browser", (key) => {
    expect(isFilePickerKey(key)).toBe(false);
  });
});

describe("file navigation guard", () => {
  it("recognizes file drags", () => {
    expect(isFileDrag({ types: ["Files"] })).toBe(true);
    expect(isFileDrag(null)).toBe(false);
  });

  it("prevents navigation only for files and leaves other drags intact", () => {
    for (const types of [["Files"], ["text/plain"], ["text/uri-list"], []]) {
      const preventDefault = vi.fn();
      preventFileNavigation({ dataTransfer: { types }, preventDefault } as unknown as DragEvent);
      expect(preventDefault).toHaveBeenCalledTimes(types.includes("Files") ? 1 : 0);
    }
  });
});
