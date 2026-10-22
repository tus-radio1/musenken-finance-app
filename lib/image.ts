/**
 * クライアント側の画像圧縮ユーティリティ。
 * アップロード前に Canvas API で縮小・再エンコードしファイルサイズを削減する。
 *
 * WebP を優先するが、ブラウザが WebP エンコードに対応していない場合
 * (Safari/iOS は PNG を返す) は JPEG にフォールバックする。
 * MIME タイプと拡張子は実際に得られた Blob の type から決定する。
 */

import {
  RECEIPT_TYPE_ERROR_MESSAGE,
  isAllowedReceiptMimeType,
  validateReceiptFile,
} from "@/lib/receipt-upload";

const MAX_WIDTH = 1200;
const MAX_HEIGHT = 1200;
const WEBP_QUALITY = 0.7;
const JPEG_QUALITY = 0.8;

const OUTPUT_EXTENSIONS: Record<string, string> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
};

/** Formats some browsers cannot decode (e.g. HEIC outside Safari). */
const HARD_TO_DECODE_TYPES = new Set([
  "image/heic",
  "image/heif",
  "image/tiff",
]);
const HARD_TO_DECODE_EXTENSIONS = /\.(heic|heif|tiff?)$/i;

export const IMAGE_DECODE_ERROR_MESSAGE =
  "このブラウザでは画像を読み込めませんでした。HEIC/TIFF 形式の場合は JPEG または PNG に変換してからアップロードしてください。";
export const IMAGE_PROCESS_ERROR_MESSAGE =
  "画像の処理中にエラーが発生しました";

/**
 * Error raised while preparing a receipt file. `message` is a Japanese
 * user-facing text that callers can show as-is.
 */
export class ReceiptFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReceiptFileError";
  }
}

/** Returns the user-facing message for an error thrown by prepareReceiptFile. */
export function getReceiptFileErrorMessage(
  error: unknown,
  fallback: string,
): string {
  return error instanceof ReceiptFileError ? error.message : fallback;
}

/** Replace (or append) the file extension. */
export function replaceFileExtension(fileName: string, extension: string): string {
  const dotIndex = fileName.lastIndexOf(".");
  const baseName = dotIndex > 0 ? fileName.substring(0, dotIndex) : fileName;
  return `${baseName || "receipt"}.${extension}`;
}

/** Fit (width, height) inside MAX_WIDTH x MAX_HEIGHT preserving aspect ratio. */
export function fitWithinBounds(
  width: number,
  height: number,
): { width: number; height: number } {
  if (width > height) {
    if (width <= MAX_WIDTH) return { width, height };
    return { width: MAX_WIDTH, height: Math.round((height * MAX_WIDTH) / width) };
  }
  if (height <= MAX_HEIGHT) return { width, height };
  return { width: Math.round((width * MAX_HEIGHT) / height), height: MAX_HEIGHT };
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, mimeType, quality);
  });
}

/**
 * Encode the canvas as WebP when supported, otherwise as JPEG.
 * Browsers that cannot encode the requested type silently return PNG, so the
 * actual blob.type is checked instead of trusting the request.
 */
export async function encodeCanvas(canvas: HTMLCanvasElement): Promise<Blob> {
  const webpBlob = await canvasToBlob(canvas, "image/webp", WEBP_QUALITY);
  if (webpBlob && webpBlob.type === "image/webp") {
    return webpBlob;
  }

  const jpegBlob = await canvasToBlob(canvas, "image/jpeg", JPEG_QUALITY);
  if (jpegBlob && jpegBlob.type === "image/jpeg") {
    return jpegBlob;
  }

  throw new ReceiptFileError(IMAGE_PROCESS_ERROR_MESSAGE);
}

function isHardToDecode(file: File): boolean {
  return (
    HARD_TO_DECODE_TYPES.has(file.type) ||
    HARD_TO_DECODE_EXTENSIONS.test(file.name)
  );
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(
        new ReceiptFileError(
          isHardToDecode(file)
            ? IMAGE_DECODE_ERROR_MESSAGE
            : IMAGE_PROCESS_ERROR_MESSAGE,
        ),
      );
    };
    img.src = objectUrl;
  });
}

/**
 * Downscale and re-encode an image. PDFs are returned unchanged.
 * Throws ReceiptFileError with a Japanese message on failure.
 */
export async function compressImage(file: File): Promise<File> {
  if (file.type === "application/pdf") {
    return file;
  }

  const img = await loadImage(file);
  const { width, height } = fitWithinBounds(img.width, img.height);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new ReceiptFileError(IMAGE_PROCESS_ERROR_MESSAGE);
  }
  // JPEG has no alpha channel: paint a white background for transparent images
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  const blob = await encodeCanvas(canvas);
  const extension = OUTPUT_EXTENSIONS[blob.type];
  return new File([blob], replaceFileExtension(file.name, extension), {
    type: blob.type,
    lastModified: Date.now(),
  });
}

/**
 * Compress (if image) and validate a receipt file before calling
 * uploadReceiptAction. Throws ReceiptFileError on any failure.
 */
export async function prepareReceiptFile(file: File): Promise<File> {
  // Some browsers report an empty type for HEIC; let decoding decide then.
  if (file.type !== "" && !isAllowedReceiptMimeType(file.type)) {
    throw new ReceiptFileError(RECEIPT_TYPE_ERROR_MESSAGE);
  }
  const prepared = await compressImage(file);
  const validationError = validateReceiptFile(prepared);
  if (validationError) {
    throw new ReceiptFileError(validationError);
  }
  return prepared;
}
