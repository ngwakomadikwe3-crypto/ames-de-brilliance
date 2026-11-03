import { NextRequest, NextResponse } from "next/server";
import { ensureReady, getStorage, LOT_MODELS_BUCKET } from "@/lib/appwrite";
import { resolveCatalogueAccess } from "@/lib/buyers/access";
import { getStaffSessionRole } from "@/lib/staff-auth";
import { AppwriteLotStore } from "@/lib/lots/appwrite-store";
import {
  LOT_MODEL_LINK_TTL_MS,
  lotModelAccess,
  mintModelLink,
  verifyModelLink,
} from "@/lib/lots/model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Lot 3D model access (STEP d1, amendment 8 as adapted — see lots/model.ts).
 *
 * POST — mint a short-lived (5 min) signed view URL for the lot's GLB.
 * Policy LOT_MODEL_ACCESS: "verified" (default) requires a verified buyer or
 * staff; "browsers" allows anyone who can browse the catalogue. The signed
 * URL binds the lot id, the CURRENT model file id (replacing the model
 * invalidates outstanding links), the viewer and the expiry.
 *
 * GET ?token&sig — serve the GLB bytes for a valid link. When the policy is
 * "verified" every served view is written to the audit log FIRST — there is
 * no code path that serves restricted model bytes without auditing them.
 */

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await ensureReady();
    const { id } = await context.params;
    const resolved = await resolveCatalogueAccess(request.headers.get("cookie"));
    if (!resolved.canBrowse) {
      return NextResponse.json({ ok: false, error: "catalogue_access_required" }, { status: 403 });
    }

    const policy = lotModelAccess();
    const allowed =
      policy === "browsers"
        ? resolved.canBrowse
        : resolved.access.kind === "staff" ||
          (resolved.access.kind === "buyer" && resolved.access.verified);
    if (!allowed) {
      return NextResponse.json({ ok: false, error: "model_access_denied" }, { status: 403 });
    }

    const store = new AppwriteLotStore();
    const lot = await store.getLot(id);
    if (!lot || (lot.state !== "published" && resolved.access.kind !== "staff")) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    if (!lot.modelFileId) {
      return NextResponse.json({ ok: false, error: "no_model" }, { status: 404 });
    }

    const viewer =
      resolved.access.kind === "staff"
        ? `staff:${(await getStaffSessionRole(request.headers.get("cookie"))) ?? "unknown"}`
        : resolved.access.kind === "buyer"
          ? `buyer:${resolved.access.buyerId}`
          : "anonymous";
    const link = mintModelLink({
      lotId: lot.id,
      fileId: lot.modelFileId,
      viewer,
      exp: Date.now() + LOT_MODEL_LINK_TTL_MS,
    });
    if (!link) {
      return NextResponse.json({ ok: false, error: "signing_unavailable" }, { status: 503 });
    }
    return NextResponse.json(
      { ok: true, url: `/api/lots/${lot.id}/model?token=${link.token}&sig=${link.sig}`, expiresInSeconds: LOT_MODEL_LINK_TTL_MS / 1000 },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[lots/model] link mint failed:", error);
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await ensureReady();
    const { id } = await context.params;
    const url = new URL(request.url);
    const payload = verifyModelLink(url.searchParams.get("token") ?? "", url.searchParams.get("sig") ?? "");
    if (!payload || payload.lotId !== id) {
      return NextResponse.json({ ok: false, error: "invalid_or_expired_link" }, { status: 403 });
    }

    const store = new AppwriteLotStore();
    const lot = await store.getLot(id);
    // The lot must still exist, still be published (staff links stop working
    // the moment a lot leaves the catalogue), and still carry the SAME model
    // file the link was minted for.
    if (!lot || lot.state !== "published" || lot.modelFileId !== payload.fileId) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }

    // Restricted policy: audit FIRST — a served view is never unaudited,
    // even if streaming fails.
    if (lotModelAccess() === "verified") {
      await store.appendAudit({
        entity: "lot",
        entityId: lot.id,
        action: "lot.model_viewed",
        actor: payload.viewer,
        detail: JSON.stringify({ fileId: payload.fileId }),
        createdAt: new Date().toISOString(),
      });
    }

    const storage = getStorage();
    const bytes = new Uint8Array(
      await storage.getFileDownload({ bucketId: LOT_MODELS_BUCKET, fileId: payload.fileId }),
    );
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "model/gltf-binary",
        "Content-Length": String(bytes.byteLength),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("[lots/model] serve failed:", error);
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
