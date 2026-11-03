import { NextRequest, NextResponse } from "next/server";
import { ensureReady } from "@/lib/appwrite";
import { getStaffSessionRole, staffActor } from "@/lib/staff-auth";
import { canManageLots } from "@/lib/lots/authz";
import { AppwriteLotStore } from "@/lib/lots/appwrite-store";
import { transitionLot } from "@/lib/lots/service";
import { LotTransitionError } from "@/lib/lots/types";
import type { LotTransitionAction } from "@/lib/lots/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIONS: readonly string[] = ["submit", "approve", "reject", "publish", "withdraw", "reopen"];

const ERROR_STATUS: Record<string, number> = {
  not_found: 404,
  role_denied: 403,
  illegal_transition: 409,
  reason_required: 400,
  incomplete: 400,
  seller_licence_expired: 409,
};

/**
 * Lot state machine (STEP d1, amendments 1 + 2). Submit/reopen are staff or
 * owner; approve/reject/publish/withdraw are owner-only — enforced in the
 * service, which also refuses publication while the seller licence is
 * expired.
 */
export async function POST(
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

    let body: { action?: unknown; reason?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
    }
    if (typeof body.action !== "string" || !ACTIONS.includes(body.action)) {
      return NextResponse.json({ ok: false, error: "unknown_action" }, { status: 400 });
    }
    const reason = typeof body.reason === "string" ? body.reason : "";

    const store = new AppwriteLotStore();
    try {
      const lot = await transitionLot(
        store,
        id,
        body.action as LotTransitionAction,
        role,
        staffActor(role as string),
        reason,
      );
      return NextResponse.json({ ok: true, lot });
    } catch (error) {
      if (error instanceof LotTransitionError) {
        return NextResponse.json(
          { ok: false, error: error.code, detail: error.detail ?? null },
          { status: ERROR_STATUS[error.code] ?? 400 },
        );
      }
      throw error;
    }
  } catch (error) {
    console.error("[staff/lots/transition] failed:", error);
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
