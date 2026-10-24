import type { ReactElement, ReactNode } from "react";

export type PageWidth = "list" | "form";

export const PAGE_WIDTH_CLASS: Record<PageWidth, string> = {
  list: "max-w-7xl",
  form: "max-w-3xl",
};

export const DIALOG_WIDTH_CLASS = {
  confirm: "sm:max-w-md",
  form: "sm:max-w-3xl",
} as const;

type PageShellProps = {
  children: ReactNode;
  width?: PageWidth;
};

export function PageShell({
  children,
  width = "list",
}: PageShellProps): ReactElement {
  return (
    <main className="flex-1 flex flex-col p-6 pt-16 md:pt-6 pb-20 md:pb-6 overflow-y-auto">
      <div className={`${PAGE_WIDTH_CLASS[width]} mx-auto w-full space-y-6`}>
        {children}
      </div>
    </main>
  );
}
