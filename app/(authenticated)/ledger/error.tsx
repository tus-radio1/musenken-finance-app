"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

export default function LedgerError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[LedgerError]", error);
  }, [error]);

  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-6 p-8">
      <div className="flex flex-col items-center gap-4 text-center">
        <AlertTriangle className="h-10 w-10 text-destructive" />
        <h2 className="text-xl font-bold">出納帳データの読み込みに失敗しました</h2>
        <p className="max-w-md text-muted-foreground">
          出納帳情報の取得中にエラーが発生しました。しばらくしてから再度お試しください。
        </p>
      </div>
      <div className="flex gap-3">
        <Button onClick={reset} variant="default">
          再試行
        </Button>
        <Button
          onClick={() => (window.location.href = "/")}
          variant="outline"
        >
          ホームに戻る
        </Button>
      </div>
    </div>
  );
}
