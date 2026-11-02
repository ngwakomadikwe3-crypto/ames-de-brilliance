/**
 * Shared plumbing for the /api storage read proxies.
 *
 * Security contract, enforced here once so every proxy route inherits it:
 *
 * - File ids are validated against Appwrite's id charset BEFORE any storage
 *   call: no slashes, no "..", no query/fragment characters. Path traversal
 *   is impossible both at the URL layer (the id is a single path segment)
 *   and at the storage layer (the id is an API parameter, never a filesystem
 *   path).
 * - The bucket id is a server-side constant supplied by the route module —
 *   NEVER derived from the request. Each proxy route can therefore reach
 *   exactly one bucket; private buckets (licence-docs, jewelry-sources,
 *   buyer KYC docs) are unreachable through a proxy that wasn't written for
 *   them.
 * - Errors collapse to 404: existence of a file id is not leaked.
 *
 * Plain Web Response (no next/server import) so the helper is unit-testable
 * under plain node:test.
 */

export const FILE_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,35}$/;

export function isValidFileId(fileId: string): boolean {
  return FILE_ID_RE.test(fileId);
}

/** Minimal storage surface the proxies need (node-appwrite Storage satisfies it). */
export interface ProxyStorage {
  getFile(args: { bucketId: string; fileId: string }): Promise<{ mimeType?: string; name?: string }>;
  getFileView(args: { bucketId: string; fileId: string }): Promise<ArrayBuffer | Uint8Array>;
}

export interface ServeStorageFileOptions {
  storage: ProxyStorage;
  /** Server-side constant from the route module — never request-derived. */
  bucketId: string;
  fileId: string;
  cacheControl: string;
  /** Force the content type (e.g. reports are always PDF). Default: file metadata. */
  contentType?: string;
  /** Send the (sanitised) original filename as an inline Content-Disposition. */
  inlineFilename?: boolean;
}

export async function serveStorageFile(opts: ServeStorageFileOptions): Promise<Response> {
  if (!isValidFileId(opts.fileId)) {
    return Response.json({ error: "Invalid file id" }, { status: 400 });
  }
  try {
    const meta = await opts.storage.getFile({ bucketId: opts.bucketId, fileId: opts.fileId });
    const view = await opts.storage.getFileView({ bucketId: opts.bucketId, fileId: opts.fileId });
    const viewBytes = view instanceof Uint8Array ? view : new Uint8Array(view);
    // Copy into a fresh ArrayBuffer so the body type is unambiguous
    // (Uint8Array<ArrayBufferLike> is not a BodyInit under the TS DOM types).
    const body = new ArrayBuffer(viewBytes.byteLength);
    new Uint8Array(body).set(viewBytes);
    const headers: Record<string, string> = {
      "Content-Type": opts.contentType || meta.mimeType || "application/octet-stream",
      "Content-Length": String(viewBytes.byteLength),
      "Cache-Control": opts.cacheControl,
      "X-Content-Type-Options": "nosniff",
    };
    if (opts.inlineFilename) {
      const name = (meta.name || "file").replace(/[^a-zA-Z0-9._-]/g, "_");
      headers["Content-Disposition"] = `inline; filename="${name}"`;
    }
    return new Response(body, { headers });
  } catch {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
}
