"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/feedback/error-state";

export default function SubsidiesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[SubsidiesError]", error);
  }, [error]);

  return (
    <ErrorState
      title="支援金データの読み込みに失敗しました"
      description="支援金情報の取得中にエラーが発生しました。しばらくしてから再度お試しください。"
      digest={error.digest}
      onRetry={reset}
      showHomeLink
      headingLevel="h1"
    />
  );
}
