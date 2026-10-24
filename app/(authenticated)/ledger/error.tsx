"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/feedback/error-state";

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
    <ErrorState
      title="出納帳データの読み込みに失敗しました"
      description="出納帳情報の取得中にエラーが発生しました。しばらくしてから再度お試しください。"
      digest={error.digest}
      onRetry={reset}
      showHomeLink
      headingLevel="h1"
    />
  );
}
