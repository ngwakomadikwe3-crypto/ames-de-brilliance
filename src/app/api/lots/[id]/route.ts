import { NextRequest, NextResponse } from "next/server";
import { ensureReady } from "@/lib/appwrite";
import { resolveCatalogueAccess } from "@/lib/buyers/access";
import { AppwriteLotStore } from "@/lib/lots/appwrite-store";
import { toCatalogueView } from "@/lib/lots/service";
import { lotModelAccess } from "@/lib/lots/model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One published lot. Non-published lots are invisible here (404 — existence
 * is not leaked to browsers); staff preview unpublished lots through the
 * /api/staff/lots management routes instead.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await ensureReady();
    const resolved = await resolveCatalogueAccess(request.headers.get("cookie"));
    if (!resolved.canBrowse) {
      return NextResponse.json(
        { ok: false, error: "catalogue_access_required" },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }

    const { id } = await context.params;
    const store = new AppwriteLotStore();
    const lot = await store.getLot(id);
    if (!lot || lot.state !== "published") {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }

    return NextResponse.json(
      {
        ok: true,
        canOffer: resolved.canOffer,
        modelAccess: lotModelAccess(),
        lot: toCatalogueView(lot, resolved.access),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[lots/id] detail failed:", error);
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
