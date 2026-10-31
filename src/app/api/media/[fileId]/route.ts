import { NextRequest, NextResponse } from "next/server";
import { ensureReady, getStorage, MEDIA_BUCKET } from "@/lib/appwrite";

export const runtime = "nodejs";

const FILE_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,35}$/;

/**
 * Public read proxy for the media bucket (storefront/product imagery).
 * The bucket itself has no client permissions; the image bytes are public by
 * design, so no session is required — but only this bucket is exposed.
 */
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ fileId: string }> }
) {
  const { fileId } = await context.params;
  if (!FILE_ID_RE.test(fileId)) {
    return NextResponse.json({ error: "Invalid file id" }, { status: 400 });
  }
  try {
    await ensureReady();
    const storage = getStorage();
    const meta = await storage.getFile({ bucketId: MEDIA_BUCKET, fileId });
    const view = await storage.getFileView({ bucketId: MEDIA_BUCKET, fileId });
    const bytes = new Uint8Array(view);
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": meta.mimeType || "application/octet-stream",
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
