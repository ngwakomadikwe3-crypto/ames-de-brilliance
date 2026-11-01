import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ensureReady } from "@/lib/appwrite";
import { AppwriteBuyerStore } from "@/lib/buyers/appwrite-store";
import { canDecideBuyers } from "@/lib/buyers/authz";
import { decideBuyer } from "@/lib/buyers/service";
import { getStaffSessionRole, staffActor } from "@/lib/staff-auth";

export const runtime = "nodejs";

const DecisionSchema = z.object({
  decision: z.enum(["approve", "reject", "suspend"]),
  // A reason is REQUIRED for every decision: the review trail must explain
  // itself to the owner, to the buyer, and to a future regulator.
  reason: z.string().trim().min(3).max(500),
});

/**
 * Staff decision on a buyer: approve / reject / suspend. Owner and staff
 * roles only — the developer-admin role can operate the platform but cannot
 * decide who may offer. Effective immediately: the access resolver re-reads the
 * buyer row on every request, so a suspension blocks the very next offer.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await ensureReady();
    const role = await getStaffSessionRole(request.headers.get("cookie"));
    if (!canDecideBuyers(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
    }
    const parsed = DecisionSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
    }

    const { id } = await context.params;
    const store = new AppwriteBuyerStore();
    const buyer = await decideBuyer(
      store,
      id,
      parsed.data.decision,
      parsed.data.reason,
      staffActor(role as string),
    );
    if (!buyer) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({
      ok: true,
      buyer: { id: buyer.id, status: buyer.status, statusReason: buyer.statusReason },
    });
  } catch (error) {
    console.error("[staff/buyers/decision] failed:", error);
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
