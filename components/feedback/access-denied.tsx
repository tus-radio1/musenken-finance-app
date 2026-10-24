import type { ReactElement } from "react";

type AccessDeniedProps = {
  description: string;
};

export function AccessDenied({ description }: AccessDeniedProps): ReactElement {
  return (
    <section
      role="alert"
      className="rounded-lg border bg-card p-6 text-center"
    >
      <h2 className="text-lg font-semibold">アクセス権限がありません</h2>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
    </section>
  );
}
