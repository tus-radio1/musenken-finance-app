"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MAX_RECEIPT_FILE_SIZE_MB, RECEIPT_FORMAT_LABEL } from "@/lib/receipt-upload";
import { getReceiptViewUrl } from "@/lib/receipt-url";
import { isFileDrag, isFilePickerKey, preventFileNavigation, selectReceiptFile } from "@/lib/receipt-file-selection";
import { cn } from "@/lib/utils";

export type FileDropzoneProps = {
  label: string;
  file: File | null;
  onFileChange: (file: File | null) => void;
  existingUrl?: string | null;
  disabled?: boolean;
  error?: string | null;
};

export function FileDropzone({ label, file, onFileChange, existingUrl, disabled = false, error }: FileDropzoneProps) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [dragOver, setDragOver] = useState(false);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const message = selectionError || error;
  const viewUrl = getReceiptViewUrl(existingUrl);

  // Dialog contents unmount when closed, so these listeners only live with an open form.
  useEffect(() => {
    const guard = (event: DragEvent): void => preventFileNavigation(event);
    window.addEventListener("dragover", guard);
    window.addEventListener("drop", guard);
    return () => {
      window.removeEventListener("dragover", guard);
      window.removeEventListener("drop", guard);
    };
  }, []);

  const chooseFiles = (files: ArrayLike<File>): void => {
    if (disabled || files.length === 0) return;
    const result = selectReceiptFile(files);
    setSelectionError(result.error);
    // Reject the whole batch and retain the previous selection on invalid input.
    if (!result.error) onFileChange(result.file);
  };
  const openPicker = (): void => {
    if (!disabled) inputRef.current?.click();
  };

  return (
    <div className="space-y-2">
      <p id={`${id}-label`} className="text-sm font-medium">{label}</p>
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        対応形式: {RECEIPT_FORMAT_LABEL} | 最大サイズ: {MAX_RECEIPT_FILE_SIZE_MB}MB | 1ファイル
      </p>
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept="image/*,.pdf"
        className="hidden"
        disabled={disabled}
        aria-labelledby={`${id}-label`}
        onChange={(event) => {
          if (event.target.files) chooseFiles(event.target.files);
          event.target.value = "";
        }}
      />
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-hint${message ? ` ${id}-error` : ""}`}
        aria-disabled={disabled}
        aria-busy={disabled}
        className={cn(
          "flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed p-4 text-center text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          dragOver && !disabled ? "border-primary bg-primary/10" : "border-input bg-muted/30",
          disabled && "cursor-not-allowed opacity-50",
        )}
        onClick={openPicker}
        onKeyDown={(event) => {
          if (isFilePickerKey(event.key)) {
            event.preventDefault();
            openPicker();
          }
        }}
        onDragEnter={(event) => {
          if (!isFileDrag(event.dataTransfer)) return;
          event.preventDefault();
          dragDepth.current += 1;
          if (!disabled) setDragOver(true);
        }}
        onDragOver={(event) => {
          if (!isFileDrag(event.dataTransfer)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = disabled ? "none" : "copy";
        }}
        onDragLeave={(event) => {
          if (!isFileDrag(event.dataTransfer)) return;
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDragOver(false);
        }}
        onDrop={(event) => {
          if (!isFileDrag(event.dataTransfer)) return;
          event.preventDefault();
          dragDepth.current = 0;
          setDragOver(false);
          chooseFiles(event.dataTransfer.files);
        }}
      >
        <Upload className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        <span>{dragOver && !disabled ? "ここにファイルをドロップ" : "ファイルをドロップ、またはクリックして選択"}</span>
        {file && <span className="max-w-full break-all">{file.name}（{(file.size / 1024).toFixed(1)} KB）</span>}
      </div>
      {file && (
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={openPicker}>変更</Button>
          <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => {
            setSelectionError(null);
            onFileChange(null);
          }}>選択を解除</Button>
        </div>
      )}
      {viewUrl && <a href={viewUrl} target="_blank" rel="noopener noreferrer" className="block text-sm text-primary underline">登録済みの{label}を表示</a>}
      {message && <p id={`${id}-error`} role="alert" className="text-sm text-destructive">{message}</p>}
    </div>
  );
}
