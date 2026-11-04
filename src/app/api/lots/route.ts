import { NextRequest, NextResponse } from "next/server";
import { ensureReady } from "@/lib/appwrite";
import { resolveCatalogueAccess } from "@/lib/buyers/access";
import { AppwriteLotStore } from "@/lib/lots/appwrite-store";
import { toCatalogueView } from "@/lib/lots/service";
import { lotModelAccess } from "@/lib/lots/model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The rough catalogue (STEP d1): published lots only.
 *
 * Access: staff and verified buyers always; anonymous visitors only when
 * CATALOGUE_PUBLIC_ACCESS=1 (server-side flag, read per request). Prices are
 * stripped unless maySeeLotPrice(access) — anonymous browsers never see them.
 * NOT an auction: no bids, no countdowns, no hammer state anywhere in this
 * payload.
 */
export async function GET(request: NextRequest) {
  try {
    await ensureReady();
    const resolved = await resolveCatalogueAccess(request.headers.get("cookie"));
    if (!resolved.canBrowse) {
      return NextResponse.json(
        { ok: false, error: "catalogue_access_required" },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }

    const store = new AppwriteLotStore();
    const lots = await store.listPublishedLots();
    return NextResponse.json(
      {
        ok: true,
        canOffer: resolved.canOffer,
        modelAccess: lotModelAccess(),
        lots: lots.map((lot) => toCatalogueView(lot, resolved.access)),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[lots] catalogue failed:", error);
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
