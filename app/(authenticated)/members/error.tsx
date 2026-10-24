"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/feedback/error-state";

export default function MembersError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[MembersError]", error);
  }, [error]);

  return (
    <ErrorState
      title="部員データの読み込みに失敗しました"
      description="部員情報の取得中にエラーが発生しました。しばらくしてから再度お試しください。"
      digest={error.digest}
      onRetry={reset}
      showHomeLink
      headingLevel="h1"
    />
  );
}
