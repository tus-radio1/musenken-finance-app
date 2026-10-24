"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/feedback/error-state";

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
    <ErrorState
      title="予期しないエラーが発生しました"
      description="申し訳ありません。問題が発生しました。しばらくしてからもう一度お試しください。"
      digest={error.digest}
      onRetry={reset}
      showHomeLink
      headingLevel="h1"
    />
  );
}
