/**
 * 領収書・根拠書類の「閲覧用 URL」を組み立てる唯一の関数。
 *
 * receipts バケットは private のため、ストレージの URL を直接画面に出さない。
 * 画面には常にアプリ内のルート (`/api/receipts?path=...`) を出し、
 * クリック時にルートがログインを確認してから短命の署名付き URL へ
 * リダイレクトする (app/api/receipts/route.ts)。
 *
 * サーバー・クライアントの両方から参照されるため、サーバー専用モジュールを
 * import してはならない。
 */

/** App route that authenticates the caller and redirects to a signed URL. */
export const RECEIPT_VIEW_ROUTE = "/api/receipts";

/** Query parameter carrying the object path. */
export const RECEIPT_VIEW_PATH_PARAM = "path";

/** Legacy public-URL prefix that older rows or code may still contain. */
const LEGACY_PUBLIC_PREFIX = "/storage/v1/object/public/receipts/";

const SAFE_PATH_CHARS = /^[a-zA-Z0-9\-._/]+$/;

/**
 * Strict object-path check for reading: conservative charset, no leading or
 * trailing slash, no empty, "." or ".." segments. Both `<userId>/<file>` and
 * legacy bucket-root names are accepted (any member may view any receipt).
 */
export function isSafeReceiptObjectPath(path: string): boolean {
  if (!SAFE_PATH_CHARS.test(path)) return false;
  return path
    .split("/")
    .every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

function getSupabaseOrigin(supabaseUrl: string | undefined): string | null {
  if (!supabaseUrl) return null;
  try {
    return new URL(supabaseUrl).origin;
  } catch {
    return null;
  }
}

/**
 * Extract the object path from a legacy public URL of THIS project's receipts
 * bucket. Any other absolute URL (other origin, other bucket, credentials,
 * query or fragment) is rejected.
 */
function pathFromLegacyPublicUrl(
  value: string,
  supabaseUrl: string | undefined,
): string | null {
  const origin = getSupabaseOrigin(supabaseUrl);
  if (!origin) return null;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.origin !== origin || url.username || url.password) return null;
  if (url.search || url.hash) return null;
  if (!url.pathname.startsWith(LEGACY_PUBLIC_PREFIX)) return null;

  try {
    return decodeURIComponent(url.pathname.slice(LEGACY_PUBLIC_PREFIX.length));
  } catch {
    return null;
  }
}

/**
 * Normalise a stored `receipt_url` / `evidence_url` value to an object path in
 * the receipts bucket, or null when it is empty or not a receipts object.
 * Relative paths are returned as-is; legacy public URLs of this project are
 * reduced to their path.
 */
export function toReceiptObjectPath(
  value: string | null | undefined,
  supabaseUrl: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL,
): string | null {
  if (!value) return null;
  const path = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value) || value.startsWith("//")
    ? pathFromLegacyPublicUrl(value, supabaseUrl)
    : value;
  if (!path || !isSafeReceiptObjectPath(path)) return null;
  return path;
}

/**
 * Link target for viewing a stored receipt / evidence file, or null when the
 * stored value is empty or not a receipts object (the UI then shows no link).
 */
export function getReceiptViewUrl(
  value: string | null | undefined,
  supabaseUrl: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL,
): string | null {
  const path = toReceiptObjectPath(value, supabaseUrl);
  if (!path) return null;
  const query = new URLSearchParams({ [RECEIPT_VIEW_PATH_PARAM]: path });
  return `${RECEIPT_VIEW_ROUTE}?${query.toString()}`;
}
