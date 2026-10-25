/**
 * Normalize stored references for integrity checks (never for signing URLs).
 * Keep user prefixes; accept legacy full URLs, including signed URL queries.
 * @param {string | null | undefined} value
 * @returns {string | null}
 */
export function receiptObjectName(value) {
  if (!value || typeof value !== "string") return null;
  let path = value.trim();
  if (/^https?:\/\//i.test(path)) {
    try {
      const url = new URL(path);
      const marker = /\/storage\/v1\/object\/(?:public|sign|authenticated)\/receipts\//;
      const match = marker.exec(url.pathname);
      path = match
        ? url.pathname.slice(match.index + match[0].length)
        : url.pathname.slice(url.pathname.lastIndexOf("/") + 1);
      path = decodeURIComponent(path);
    } catch {
      return null;
    }
  }
  if (!/^[a-zA-Z0-9._/-]+$/.test(path)) return null;
  if (path.split("/").some((part) => !part || part === "." || part === "..")) return null;
  return path;
}

/** Collect receipt/evidence fields recursively from audit JSON.
 * @param {unknown} value
 * @returns {string[]}
 */
export function auditReceiptNames(value) {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => {
    if ((key === "receipt_url" || key === "evidence_url") && typeof child === "string") {
      const name = receiptObjectName(child);
      return name ? [name] : [];
    }
    return auditReceiptNames(child);
  });
}
