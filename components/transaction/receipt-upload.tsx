"use client";

/**
 * 領収書アップロードセクション。
 * ファイル選択・プレビュー表示を担当する。
 * URL.createObjectURL のリークを修正 (P-6):
 *   - URL の生成と revoke をイベントハンドラ内で管理し、set-state-in-effect を回避。
 *   - アンマウント時に残存する URL を useEffect クリーンアップで解放。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Upload, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormLabel } from "@/components/ui/form";

type Props = {
  file: File | null;
  onFileChange: (file: File | null) => void;
};

export function ReceiptUpload({ file, onFileChange }: Props) {
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
    <div className="space-y-2">
      <FormLabel>領収書データ (任意)</FormLabel>
      <p className="text-xs text-muted-foreground">
        対応形式: JPEG / PNG / WebP / GIF / HEIC / TIFF / BMP / PDF &nbsp;|&nbsp; 最大サイズ: 10MB
      </p>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              document.getElementById("receipt-upload")?.click()
            }
          >
            <Upload className="mr-2 h-4 w-4" />
            {file ? "データを変更" : "データを選択"}
          </Button>
          <span className="text-sm text-muted-foreground truncate max-w-[200px]">
            {file ? file.name : "選択されていません"}
          </span>
          <Input
            id="receipt-upload"
            type="file"
            accept="image/*,.pdf"
            className="hidden"
            onChange={(e) => {
              const selectedFile = e.target.files?.[0];
              handleFileSelect(selectedFile ?? null);
            }}
          />
        </div>
        {/* 画像プレビュー — blob URL (URL.createObjectURL) を表示するため
           next/image は使用不可（src に blob: スキームを渡せない）。
           ローカルファイル選択時のプレビュー専用なのでパフォーマンス影響なし。 */}
        {previewUrl && (
          <div className="w-full max-w-[200px] border rounded-md overflow-hidden bg-muted flex flex-col items-center justify-center p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="プレビュー"
              className="object-contain max-h-[150px] w-auto h-auto rounded-sm"
            />
          </div>
        )}
        {file && file.type === "application/pdf" && (
          <div className="w-full max-w-[200px] h-24 border rounded-md bg-muted flex items-center justify-center text-sm font-medium text-muted-foreground flex-col gap-2">
            <FileText className="h-8 w-8 text-muted-foreground/60" />
            <span>PDFデータ</span>
          </div>
        )}
      </div>
    </div>
  );
}
