import { NextRequest, NextResponse } from "next/server";
import { ensureReady, getStorage, LICENCE_DOCS_BUCKET } from "@/lib/appwrite";
import { serveStorageFile } from "@/lib/file-proxy";
import { sessionTokenFromCookieHeader, verifySession } from "@/lib/session";

export const runtime = "nodejs";

/**
 * Staff-only proxy for KYC licence documents. The bucket never had client
 * read permission, so dashboard <img> tags pointing at direct Appwrite URLs
 * were broken; this route both secures and fixes that path. The bucket id is
 * a server-side constant; the file id is validated in serveStorageFile
 * before any storage call (see src/lib/file-proxy.ts).
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ fileId: string }> }
) {
  const { fileId } = await context.params;
  const token = sessionTokenFromCookieHeader(req.headers.get("cookie"));
  if (!token || !(await verifySession(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await ensureReady();
  return serveStorageFile({
    storage: getStorage(),
    bucketId: LICENCE_DOCS_BUCKET,
    fileId,
    cacheControl: "private, no-store",
  });
}
