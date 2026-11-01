import { NextRequest } from "next/server";
import { ensureReady, getStorage, MEDIA_BUCKET } from "@/lib/appwrite";
import { serveStorageFile } from "@/lib/file-proxy";

export const runtime = "nodejs";

/**
 * Public read proxy for the media bucket (storefront/product imagery).
 * The bucket itself has no client permissions; the image bytes are public by
 * design, so no session is required — but only this bucket is exposed. The
 * bucket id is a server-side constant; the file id is validated in
 * serveStorageFile before any storage call (no traversal, no cross-bucket
 * access — see src/lib/file-proxy.ts).
 */
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ fileId: string }> }
) {
  const { fileId } = await context.params;
  await ensureReady();
  return serveStorageFile({
    storage: getStorage(),
    bucketId: MEDIA_BUCKET,
    fileId,
    cacheControl: "public, max-age=31536000, immutable",
  });
}
