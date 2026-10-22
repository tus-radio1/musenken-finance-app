/**
 * 領収書・根拠書類アップロードの共有定数とバリデーション。
 *
 * サーバー (uploadReceiptAction) とクライアント (事前チェック・UI 表示) の
 * 両方から参照されるため、サーバー専用モジュールを import してはならない。
 */

/** Maximum upload size in megabytes (shown in the UI). */
export const MAX_RECEIPT_FILE_SIZE_MB = 10;

/** Maximum upload size in bytes (enforced by client pre-check and server). */
export const MAX_RECEIPT_FILE_SIZE_BYTES = MAX_RECEIPT_FILE_SIZE_MB * 1024 * 1024;

/**
 * Server Action body size limit. Larger than the file limit to leave headroom
 * for multipart encoding overhead (boundaries, headers, other fields).
 */
export const RECEIPT_SERVER_ACTION_BODY_LIMIT = "12mb";

/**
 * Allowed MIME types mapped to the extension the server uses for the stored
 * object. The extension is never taken from the client-supplied file name.
 */
export const RECEIPT_MIME_EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/tiff": "tiff",
  "image/bmp": "bmp",
  "application/pdf": "pdf",
} as const satisfies Record<string, string>;

export type ReceiptMimeType = keyof typeof RECEIPT_MIME_EXTENSIONS;

export const ALLOWED_RECEIPT_MIME_TYPES = Object.keys(
  RECEIPT_MIME_EXTENSIONS,
) as ReceiptMimeType[];

/** Human-readable format list for UI hints and error messages. */
export const RECEIPT_FORMAT_LABEL =
  "JPEG / PNG / WebP / GIF / HEIC / TIFF / BMP / PDF";

export const RECEIPT_TYPE_ERROR_MESSAGE = `許可されていないファイル形式です（${RECEIPT_FORMAT_LABEL} のみ）`;

export const RECEIPT_SIZE_ERROR_MESSAGE = `ファイルサイズが大きすぎます（最大${MAX_RECEIPT_FILE_SIZE_MB}MB）`;

export function isAllowedReceiptMimeType(
  mimeType: string,
): mimeType is ReceiptMimeType {
  return Object.prototype.hasOwnProperty.call(RECEIPT_MIME_EXTENSIONS, mimeType);
}

/**
 * Validate the MIME type and size of a file to be uploaded.
 * Returns a Japanese error message, or null when the file is acceptable.
 */
export function validateReceiptFile(file: {
  type: string;
  size: number;
}): string | null {
  if (!isAllowedReceiptMimeType(file.type)) {
    return RECEIPT_TYPE_ERROR_MESSAGE;
  }
  if (file.size <= 0) {
    return "ファイルが空です";
  }
  if (file.size > MAX_RECEIPT_FILE_SIZE_BYTES) {
    return RECEIPT_SIZE_ERROR_MESSAGE;
  }
  return null;
}

/**
 * Relative storage path check: no URLs, no traversal, conservative charset.
 */
export function isValidReceiptPath(path: string): boolean {
  return /^[a-zA-Z0-9\-._/]+$/.test(path) && !path.includes("..");
}

/** True when the path lives under the given user's storage prefix. */
export function isReceiptPathOwnedBy(path: string, userId: string): boolean {
  return isValidReceiptPath(path) && path.startsWith(`${userId}/`);
}

/** Error shown when a client-supplied receipt / evidence path is rejected. */
export const RECEIPT_PATH_ERROR_MESSAGE = "領収書URLの形式が不正です";

/** Record columns that hold a path in the receipts bucket. */
export const RECEIPT_PATH_COLUMNS = ["receipt_url", "evidence_url"] as const;
export type ReceiptPathColumn = (typeof RECEIPT_PATH_COLUMNS)[number];

type ReceiptPathValues = Partial<Record<ReceiptPathColumn, string | null>>;

export type ReceiptPathUpdateCheck =
  | { ok: true; normalized: ReceiptPathValues; changed: ReceiptPathColumn[] }
  | { ok: false };

/**
 * Apply the receipt-path rule shared by every record writer
 * (same as updateTransaction in app/actions.ts):
 *   - absent / undefined = keep, "" or null = clear,
 *   - a value equal to the stored one = keep (legacy / external paths allowed),
 *   - any other value must live under the actor's own storage prefix.
 *
 * Returns the normalised receipt columns to merge into the update and the
 * columns whose stored path is being replaced (for post-update cleanup).
 */
export function checkReceiptPathUpdates(
  updates: Readonly<Record<string, unknown>>,
  stored: Readonly<ReceiptPathValues>,
  actorUserId: string,
): ReceiptPathUpdateCheck {
  const normalized: ReceiptPathValues = {};
  const changed: ReceiptPathColumn[] = [];

  for (const column of RECEIPT_PATH_COLUMNS) {
    const raw = updates[column];
    if (raw === undefined) continue;
    if (raw !== null && typeof raw !== "string") return { ok: false };

    const next = raw === "" ? null : raw;
    normalized[column] = next;
    if (next === (stored[column] ?? null)) continue;
    if (next !== null && !isReceiptPathOwnedBy(next, actorUserId)) {
      return { ok: false };
    }
    changed.push(column);
  }

  return { ok: true, normalized, changed };
}
