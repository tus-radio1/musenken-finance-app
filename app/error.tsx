"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[GlobalError]", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 p-8">
      <div className="flex flex-col items-center gap-4 text-center">
        <AlertTriangle className="h-12 w-12 text-destructive" />
        <h2 className="text-2xl font-bold">
          予期しないエラーが発生しました
        </h2>
        <p className="max-w-md text-muted-foreground">
          申し訳ありません。問題が発生しました。しばらくしてからもう一度お試しください。
        </p>
        {error.digest && (
          <p className="text-xs text-muted-foreground">
            エラーID: {error.digest}
          </p>
        )}
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
