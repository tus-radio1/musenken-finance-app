import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  IMAGE_DECODE_ERROR_MESSAGE,
  ReceiptFileError,
  compressImage,
  encodeCanvas,
  fitWithinBounds,
  getReceiptFileErrorMessage,
  prepareReceiptFile,
  replaceFileExtension,
} from "@/lib/image";
import {
  MAX_RECEIPT_FILE_SIZE_BYTES,
  RECEIPT_SIZE_ERROR_MESSAGE,
  RECEIPT_TYPE_ERROR_MESSAGE,
  validateReceiptFile,
} from "@/lib/receipt-upload";

// ---------------------------------------------------------------------------
// Browser API fakes
// ---------------------------------------------------------------------------

/**
 * Fake canvas whose toBlob returns a blob of the type the "browser" supports.
 * Safari/iOS ignores an unsupported type and returns PNG.
 */
function makeCanvas(supportedTypes: string[]) {
  const toBlob = vi.fn(
    (callback: (blob: Blob | null) => void, type: string) => {
      const actualType = supportedTypes.includes(type) ? type : "image/png";
      callback(new Blob([new Uint8Array(10)], { type: actualType }));
    },
  );
  return {
    width: 0,
    height: 0,
    toBlob,
    getContext: () => ({ fillStyle: "", fillRect: vi.fn(), drawImage: vi.fn() }),
  };
}

function installImage(decodable: boolean) {
  class FakeImage {
    width = 2400;
    height = 1200;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_value: string) {
      queueMicrotask(() => (decodable ? this.onload?.() : this.onerror?.()));
    }
  }
  vi.stubGlobal("Image", FakeImage);
}

function installCanvas(supportedTypes: string[]) {
  const canvas = makeCanvas(supportedTypes);
  vi.stubGlobal("document", { createElement: () => canvas });
  return canvas;
}

beforeEach(() => {
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fake");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe("replaceFileExtension", () => {
  it("replaces an existing extension", () => {
    expect(replaceFileExtension("IMG_0001.HEIC", "jpg")).toBe("IMG_0001.jpg");
  });

  it("appends an extension when none exists", () => {
    expect(replaceFileExtension("scan", "webp")).toBe("scan.webp");
  });

  it("treats a leading-dot name as having no extension", () => {
    expect(replaceFileExtension(".png", "jpg")).toBe(".png.jpg");
  });
});

describe("fitWithinBounds", () => {
  it("scales a wide image down to the max width", () => {
    expect(fitWithinBounds(2400, 1200)).toEqual({ width: 1200, height: 600 });
  });

  it("scales a tall image down to the max height", () => {
    expect(fitWithinBounds(1000, 2000)).toEqual({ width: 600, height: 1200 });
  });

  it("keeps an image already within bounds", () => {
    expect(fitWithinBounds(1200, 1200)).toEqual({ width: 1200, height: 1200 });
  });
});

// ---------------------------------------------------------------------------
// encodeCanvas
// ---------------------------------------------------------------------------

describe("encodeCanvas", () => {
  it("returns WebP when the browser can encode it", async () => {
    const canvas = makeCanvas(["image/webp", "image/jpeg"]);

    const blob = await encodeCanvas(canvas as unknown as HTMLCanvasElement);

    expect(blob.type).toBe("image/webp");
    expect(canvas.toBlob).toHaveBeenCalledTimes(1);
  });

  it("falls back to JPEG when WebP encoding silently yields PNG (Safari)", async () => {
    const canvas = makeCanvas(["image/jpeg"]);

    const blob = await encodeCanvas(canvas as unknown as HTMLCanvasElement);

    expect(blob.type).toBe("image/jpeg");
    expect(canvas.toBlob).toHaveBeenLastCalledWith(
      expect.any(Function),
      "image/jpeg",
      expect.any(Number),
    );
  });

  it("throws a ReceiptFileError when neither format can be encoded", async () => {
    const canvas = makeCanvas([]);

    await expect(
      encodeCanvas(canvas as unknown as HTMLCanvasElement),
    ).rejects.toBeInstanceOf(ReceiptFileError);
  });
});

// ---------------------------------------------------------------------------
// compressImage / prepareReceiptFile
// ---------------------------------------------------------------------------

describe("compressImage", () => {
  it("labels the output with the actual blob type and extension on Safari", async () => {
    installImage(true);
    installCanvas(["image/jpeg"]);
    const input = new File([new Uint8Array(100)], "receipt.png", {
      type: "image/png",
    });

    const output = await compressImage(input);

    expect(output.type).toBe("image/jpeg");
    expect(output.name).toBe("receipt.jpg");
  });

  it("outputs WebP with a .webp name when supported", async () => {
    installImage(true);
    installCanvas(["image/webp"]);
    const input = new File([new Uint8Array(100)], "receipt.jpeg", {
      type: "image/jpeg",
    });

    const output = await compressImage(input);

    expect(output.type).toBe("image/webp");
    expect(output.name).toBe("receipt.webp");
  });

  it("returns PDFs unchanged", async () => {
    const pdf = new File([new Uint8Array(100)], "doc.pdf", {
      type: "application/pdf",
    });

    expect(await compressImage(pdf)).toBe(pdf);
  });

  it("raises a clear Japanese error when HEIC cannot be decoded", async () => {
    installImage(false);
    installCanvas(["image/webp"]);
    const heic = new File([new Uint8Array(100)], "IMG_0001.HEIC", {
      type: "image/heic",
    });

    await expect(compressImage(heic)).rejects.toThrow(
      IMAGE_DECODE_ERROR_MESSAGE,
    );
  });

  it("detects undecodable HEIC by extension when the browser reports no type", async () => {
    installImage(false);
    installCanvas(["image/webp"]);
    const heic = new File([new Uint8Array(100)], "IMG_0001.heic", { type: "" });

    await expect(compressImage(heic)).rejects.toThrow(
      IMAGE_DECODE_ERROR_MESSAGE,
    );
  });
});

describe("prepareReceiptFile", () => {
  it("rejects a disallowed type before processing", async () => {
    const html = new File(["<html>"], "a.html", { type: "text/html" });

    await expect(prepareReceiptFile(html)).rejects.toThrow(
      RECEIPT_TYPE_ERROR_MESSAGE,
    );
  });

  it("rejects a PDF above the size limit", async () => {
    const pdf = new File(
      [new Uint8Array(MAX_RECEIPT_FILE_SIZE_BYTES + 1)],
      "big.pdf",
      { type: "application/pdf" },
    );

    await expect(prepareReceiptFile(pdf)).rejects.toThrow(
      RECEIPT_SIZE_ERROR_MESSAGE,
    );
  });
});

describe("getReceiptFileErrorMessage", () => {
  it("returns the ReceiptFileError message", () => {
    expect(getReceiptFileErrorMessage(new ReceiptFileError("x"), "fb")).toBe(
      "x",
    );
  });

  it("returns the fallback for other errors", () => {
    expect(getReceiptFileErrorMessage(new Error("internal"), "fb")).toBe("fb");
  });
});

// ---------------------------------------------------------------------------
// validateReceiptFile (shared with the server)
// ---------------------------------------------------------------------------

describe("validateReceiptFile", () => {
  it("accepts an allowed type at exactly the size limit", () => {
    expect(
      validateReceiptFile({
        type: "application/pdf",
        size: MAX_RECEIPT_FILE_SIZE_BYTES,
      }),
    ).toBeNull();
  });

  it("rejects an empty file", () => {
    expect(validateReceiptFile({ type: "image/png", size: 0 })).not.toBeNull();
  });

  it("rejects an unknown type", () => {
    expect(validateReceiptFile({ type: "image/svg+xml", size: 10 })).toBe(
      RECEIPT_TYPE_ERROR_MESSAGE,
    );
  });
});
