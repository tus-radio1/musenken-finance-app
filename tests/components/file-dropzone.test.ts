import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { FileDropzone, type FileDropzoneProps } from "@/components/receipt/file-dropzone";

const render = (props: Partial<FileDropzoneProps> = {}): string => renderToStaticMarkup(
  createElement(FileDropzone, { label: "領収書", file: null, onFileChange: vi.fn(), ...props }),
);

describe("FileDropzone accessible markup (no DOM test dependencies installed)", () => {
  it("has a focusable named button and the original mobile picker accept types", () => {
    const html = render();
    expect(html).toContain('role="button"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('aria-labelledby=');
    expect(html).toContain('accept="image/*,.pdf"');
    expect(html).not.toContain('multiple=');
  });

  it("shows the selected name, size, remove and replace actions", () => {
    const html = render({ file: new File([new Uint8Array(2048)], "receipt.pdf", { type: "application/pdf" }) });
    expect(html).toContain("receipt.pdf（2.0 KB）");
    expect(html).toContain("選択を解除");
    expect(html).toContain("変更");
  });

  it("uses the authenticated view route for existing files", () => {
    expect(render({ existingUrl: "member/receipt.pdf" })).toContain('href="/api/receipts?path=member%2Freceipt.pdf"');
    expect(render({ existingUrl: "https://other.example/file.pdf" })).not.toContain('href=');
  });

  it("disables picker and keyboard focus while uploading and announces inline errors", () => {
    const html = render({ disabled: true, error: "ファイルサイズが大きすぎます" });
    expect(html).toContain('disabled=""');
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('role="alert"');
    expect(html).toContain("ファイルサイズが大きすぎます");
  });

  it("uses unique input IDs for multiple dropzones on one page", () => {
    const html = renderToStaticMarkup(createElement("div", null,
      createElement(FileDropzone, { label: "領収書", file: null, onFileChange: vi.fn() }),
      createElement(FileDropzone, { label: "根拠書類", file: null, onFileChange: vi.fn() }),
    ));
    const ids = Array.from(html.matchAll(/<input[^>]* id="([^"]+)"/g), (match) => match[1]);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });
});
