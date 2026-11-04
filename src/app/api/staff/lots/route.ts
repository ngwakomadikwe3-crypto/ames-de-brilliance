import { NextRequest, NextResponse } from "next/server";
import { ID } from "node-appwrite";
import { ensureReady } from "@/lib/appwrite";
import { getStaffSessionRole, staffActor } from "@/lib/staff-auth";
import { canManageLots } from "@/lib/lots/authz";
import { AppwriteLotStore } from "@/lib/lots/appwrite-store";
import { createLot, toStaffView } from "@/lib/lots/service";
import { DuplicateLotNoError, LotTransitionError } from "@/lib/lots/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Staff lot management (STEP d1). Owner/staff only (canManageLots); the
 * proxy layer has already required a staff session and same-origin for the
 * POST — the role matrix is re-checked here on every call.
 */

export async function GET(request: NextRequest) {
  try {
    await ensureReady();
    const role = await getStaffSessionRole(request.headers.get("cookie"));
    if (!canManageLots(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const store = new AppwriteLotStore();
    const lots = await store.listLots();
    const withCounts = await Promise.all(
      lots.map(async (lot) => ({
        ...toStaffView(lot),
        complianceCount: (await store.listComplianceDocs(lot.id)).length,
      })),
    );
    return NextResponse.json({ ok: true, lots: withCounts }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[staff/lots] list failed:", error);
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureReady();
    const role = await getStaffSessionRole(request.headers.get("cookie"));
    if (!canManageLots(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
    }

    const store = new AppwriteLotStore();
    try {
      const lot = await createLot(
        store,
        { ...(body as Record<string, unknown>), id: ID.unique() } as Parameters<typeof createLot>[1],
        staffActor(role as string),
      );
      return NextResponse.json({ ok: true, lot: toStaffView(lot) }, { status: 201 });
    } catch (error) {
      if (error instanceof DuplicateLotNoError) {
        return NextResponse.json({ ok: false, error: "duplicate_lot_no" }, { status: 409 });
      }
      if (error instanceof LotTransitionError) {
        return NextResponse.json({ ok: false, error: error.code, detail: error.detail ?? null }, { status: 400 });
      }
      throw error;
    }
  } catch (error) {
    console.error("[staff/lots] create failed:", error);
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
