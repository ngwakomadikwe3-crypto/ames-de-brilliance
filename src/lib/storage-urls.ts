/* ── Storage URL helpers (client-safe: no node-appwrite imports) ──
 *
 * All buckets are server-only: browsers can no longer hit Appwrite storage
 * directly. Files are served through same-origin proxy routes:
 *
 *   media         → /api/media/[fileId]           (public storefront imagery)
 *   reports       → /api/reports/file/[fileId]    (published report issues)
 *   licence-docs  → /api/licence-docs/[fileId]    (staff session required)
 *
 * Rows written before the lockdown store absolute Appwrite URLs
 * (…/storage/buckets/<bucket>/files/<id>/view?project=…). rewriteStoredUrl
 * converts those to the proxy path at read time; external URLs (e.g. video
 * CDN links) pass through unchanged.
 */

const LEGACY_FILE_RE =
  /\/storage\/buckets\/([a-z0-9-]+)\/files\/([A-Za-z0-9._-]{1,36})\/(view|download|preview)/;

export function legacyStorageFile(
  value: string
): { bucket: string; fileId: string } | null {
  const m = value.match(LEGACY_FILE_RE);
  return m ? { bucket: m[1], fileId: m[2] } : null;
}

export function proxyPathForBucket(bucket: string, fileId: string): string | null {
  switch (bucket) {
    case "media":
      return `/api/media/${fileId}`;
    case "reports":
      return `/api/reports/file/${fileId}`;
    case "licence-docs":
      return `/api/licence-docs/${fileId}`;
    default:
      return null; // jewelry-sources is never proxied to clients
  }
}

/** Rewrite a stored URL to its server-proxy equivalent. Unknown/external URLs pass through. */
export function rewriteStoredUrl(value: string): string {
  if (!value) return value;
  const legacy = legacyStorageFile(value);
  if (!legacy) return value;
  return proxyPathForBucket(legacy.bucket, legacy.fileId) ?? value;
}

/** Stones store photos as a pipe-separated list. */
export function rewritePhotoList(photoField: string): string {
  if (!photoField) return photoField;
  return photoField
    .split("|")
    .map((seg) => rewriteStoredUrl(seg.trim()))
    .filter(Boolean)
    .join("|");
}
