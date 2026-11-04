import { NextRequest, NextResponse } from "next/server";
import { ensureReady } from "@/lib/appwrite";
import { getStaffSessionRole, staffActor } from "@/lib/staff-auth";
import { canManageLots } from "@/lib/lots/authz";
import { AppwriteLotStore } from "@/lib/lots/appwrite-store";
import { editLot, sanitizeLotPatch, toStaffView } from "@/lib/lots/service";
import { DuplicateLotNoError, LotTransitionError } from "@/lib/lots/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await ensureReady();
    const role = await getStaffSessionRole(request.headers.get("cookie"));
    if (!canManageLots(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await context.params;
    const store = new AppwriteLotStore();
    const lot = await store.getLot(id);
    if (!lot) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    const compliance = await store.listComplianceDocs(id);
    return NextResponse.json(
      { ok: true, lot: toStaffView(lot), compliance },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[staff/lots/id] read failed:", error);
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}

/**
 * Edit material lot fields. Amendment 6 lives in the service: a real change
 * to any material field demotes an approved/published lot to pending_review.
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await ensureReady();
    const role = await getStaffSessionRole(request.headers.get("cookie"));
    if (!canManageLots(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await context.params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
    }

    const store = new AppwriteLotStore();
    try {
      const lot = await editLot(store, id, sanitizeLotPatch(body), staffActor(role as string));
      return NextResponse.json({ ok: true, lot: toStaffView(lot) });
    } catch (error) {
      if (error instanceof LotTransitionError) {
        const status = error.code === "not_found" ? 404 : 400;
        return NextResponse.json({ ok: false, error: error.code, detail: error.detail ?? null }, { status });
      }
      if (error instanceof DuplicateLotNoError) {
        return NextResponse.json({ ok: false, error: "duplicate_lot_no" }, { status: 409 });
      }
      throw error;
    }
  } catch (error) {
    console.error("[staff/lots/id] edit failed:", error);
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
