import { NextRequest, NextResponse } from "next/server";
import { ensureReady, getStorage, LICENCE_DOCS_BUCKET } from "@/lib/appwrite";
import { sessionTokenFromCookieHeader, verifySession } from "@/lib/session";

export const runtime = "nodejs";

const FILE_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,35}$/;

/**
 * Staff-only proxy for KYC licence documents. The bucket never had client
 * read permission, so dashboard <img> tags pointing at direct Appwrite URLs
 * were broken; this route both secures and fixes that path.
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
  if (!FILE_ID_RE.test(fileId)) {
    return NextResponse.json({ error: "Invalid file id" }, { status: 400 });
  }
  try {
    await ensureReady();
    const storage = getStorage();
    const meta = await storage.getFile({ bucketId: LICENCE_DOCS_BUCKET, fileId });
    const view = await storage.getFileView({ bucketId: LICENCE_DOCS_BUCKET, fileId });
    const bytes = new Uint8Array(view);
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": meta.mimeType || "application/octet-stream",
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
