import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { PageHeader } from "@/components/layout/page-header";

describe("shared page and feedback markup", () => {
  it("renders one page heading with its description and actions", () => {
    const html = renderToStaticMarkup(
      createElement(PageHeader, {
        title: "経費申請",
        description: "活動費を申請できます。",
        actions: createElement("button", null, "新規申請"),
      }),
    );

    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain("経費申請");
    expect(html).toContain("活動費を申請できます。");
    expect(html).toContain("新規申請");
  });

  it("renders a Japanese error message, digest, retry and home actions", () => {
    const html = renderToStaticMarkup(
      createElement(ErrorState, {
        title: "データを読み込めませんでした",
        description: "時間をおいて再度お試しください。",
        digest: "error-123",
        onRetry: vi.fn(),
        showHomeLink: true,
      }),
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain("データを読み込めませんでした");
    expect(html).toContain("時間をおいて再度お試しください。");
    expect(html).toContain("エラーID: error-123");
    expect(html).toContain("再試行");
    expect(html).toContain('href="/"');
  });

  it("renders a consistent empty state and optional action", () => {
    const html = renderToStaticMarkup(
      createElement(EmptyState, {
        message: "まだ申請はありません。",
        action: createElement("button", null, "申請する"),
      }),
    );

    expect(html).toContain('role="status"');
    expect(html).toContain("まだ申請はありません。");
    expect(html).toContain("申請する");
  });
});
