import type { ReactElement, ReactNode } from "react";
import { cn } from "@/lib/utils";

type EmptyStateProps = {
  message: string;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({
  message,
  action,
  className,
}: EmptyStateProps): ReactElement {
  return (
    <div
      role="status"
      className={cn("py-8 text-center text-sm text-muted-foreground", className)}
    >
      <p>{message}</p>
      {action}
    </div>
  );
}
