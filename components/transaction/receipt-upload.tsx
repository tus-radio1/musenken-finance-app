"use client";

/**
 * 領収書アップロードセクション。
 * ファイル選択・プレビュー表示を担当する。
 * URL.createObjectURL のリークを修正 (P-6):
 *   - URL の生成と revoke をイベントハンドラ内で管理し、set-state-in-effect を回避。
 *   - アンマウント時に残存する URL を useEffect クリーンアップで解放。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { FileText } from "lucide-react";
import { FileDropzone } from "@/components/receipt/file-dropzone";
import { cn } from "@/lib/utils";

type Props = {
  file: File | null;
  onFileChange: (file: File | null) => void;
  existingUrl?: string | null;
  disabled?: boolean;
  error?: string | null;
  className?: string;
  dropzoneClassName?: string;
};

export function ReceiptUpload({
  file,
  onFileChange,
  existingUrl,
  disabled,
  error,
  className,
  dropzoneClassName,
}: Props) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  // revoke 用に現在の URL を追跡
  const currentUrlRef = useRef<string | null>(null);

  // ファイル変更時に URL の生成・revoke をイベントドリブンで行う
  const handleFileSelect = useCallback(
    (newFile: File | null) => {
      // 以前の URL を解放
      if (currentUrlRef.current) {
        URL.revokeObjectURL(currentUrlRef.current);
        currentUrlRef.current = null;
      }

      if (newFile && newFile.type.startsWith("image/")) {
        const url = URL.createObjectURL(newFile);
        currentUrlRef.current = url;
        setPreviewUrl(url);
      } else {
        setPreviewUrl(null);
      }

      onFileChange(newFile);
    },
    [onFileChange],
  );

  // アンマウント時のクリーンアップ (P-6)
  useEffect(() => {
    return () => {
      if (currentUrlRef.current) {
        URL.revokeObjectURL(currentUrlRef.current);
      }
    };
  }, []);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <FileDropzone
        label="領収書データ (任意)"
        file={file}
        onFileChange={handleFileSelect}
        existingUrl={existingUrl}
        disabled={disabled}
        error={error}
        className="flex flex-1 flex-col"
        dropzoneClassName={dropzoneClassName}
      />
      <div className="flex flex-col gap-2">
        {/* 画像プレビュー — blob URL (URL.createObjectURL) を表示するため
           next/image は使用不可（src に blob: スキームを渡せない）。
           ローカルファイル選択時のプレビュー専用なのでパフォーマンス影響なし。 */}
        {previewUrl && (
          <div className="w-full max-w-40 border rounded-md overflow-hidden bg-muted flex flex-col items-center justify-center p-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="プレビュー"
              className="object-contain max-h-28 w-auto h-auto rounded-sm"
            />
          </div>
        )}
        {file && file.type === "application/pdf" && (
          <div className="w-full max-w-40 h-16 border rounded-md bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground flex-col gap-1">
            <FileText className="h-6 w-6 text-muted-foreground/60" aria-hidden="true" />
            <span>PDFデータ</span>
          </div>
        )}
      </div>
    </div>
  );
}
