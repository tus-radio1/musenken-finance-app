import type { ReactElement } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

type ErrorStateProps = {
  title?: string;
  description: string;
  digest?: string;
  onRetry?: () => void;
  showHomeLink?: boolean;
  headingLevel?: "h1" | "h2";
};

export function ErrorState({
  title = "エラーが発生しました",
  description,
  digest,
  onRetry,
  showHomeLink = false,
  headingLevel = "h2",
}: ErrorStateProps): ReactElement {
  const Heading = headingLevel;

  return (
    <section
      role="alert"
      className="flex min-h-[40vh] flex-col items-center justify-center gap-6 p-8"
    >
      <div className="flex flex-col items-center gap-4 text-center">
        <AlertTriangle className="h-10 w-10 text-destructive" aria-hidden="true" />
        <Heading className="text-xl font-bold">{title}</Heading>
        <p className="max-w-md text-muted-foreground">{description}</p>
        {digest && (
          <p className="text-xs text-muted-foreground">エラーID: {digest}</p>
        )}
      </div>
      {(onRetry || showHomeLink) && (
        <div className="flex gap-3">
          {onRetry && (
            <Button onClick={onRetry} variant="default">
              再試行
            </Button>
          )}
          {showHomeLink && (
            <Button variant="outline" asChild>
              <Link href="/">ホームに戻る</Link>
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
