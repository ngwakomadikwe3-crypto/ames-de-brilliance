import { NextRequest, NextResponse } from "next/server";
import { ensureReady, getStorage, LOT_PHOTOS_BUCKET } from "@/lib/appwrite";
import { resolveCatalogueAccess } from "@/lib/buyers/access";
import { serveStorageFile } from "@/lib/file-proxy";
import { AppwriteLotStore } from "@/lib/lots/appwrite-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Lot photography proxy. The lot-photos bucket is server-only; every photo
 * is served through here. Guards:
 * - catalogue browse access (staff / verified buyer / flagged-open public);
 * - the requested file id must belong to THIS lot's photo list, so the route
 *   can never be used to probe or fetch arbitrary bucket files (no IDOR);
 * - buyers and anonymous visitors see photos of PUBLISHED lots only — staff
 *   may preview photos of a lot in any state (dashboard management).
 * Errors collapse to 404: existence of a file id is not leaked.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string; fileId: string }> },
) {
  try {
    await ensureReady();
    const resolved = await resolveCatalogueAccess(request.headers.get("cookie"));
    if (!resolved.canBrowse) {
      return NextResponse.json({ ok: false, error: "catalogue_access_required" }, { status: 403 });
    }

    const { id, fileId } = await context.params;
    const store = new AppwriteLotStore();
    const lot = await store.getLot(id);
    if (!lot || !lot.photoFileIds.includes(fileId)) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    if (lot.state !== "published" && resolved.access.kind !== "staff") {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }

    return serveStorageFile({
      storage: getStorage(),
      bucketId: LOT_PHOTOS_BUCKET,
      fileId,
      cacheControl: "private, max-age=300",
    });
  } catch (error) {
    console.error("[lots/photo] failed:", error);
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
