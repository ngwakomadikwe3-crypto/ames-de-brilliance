import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ensureReady } from "@/lib/appwrite";
import { AppwriteBidderStore } from "@/lib/bidders/appwrite-store";
import { canDecideBidders } from "@/lib/bidders/authz";
import { decideBidder } from "@/lib/bidders/service";
import { getStaffSessionRole, staffActor } from "@/lib/staff-auth";

export const runtime = "nodejs";

const DecisionSchema = z.object({
  decision: z.enum(["approve", "reject", "suspend"]),
  // A reason is REQUIRED for every decision: the review trail must explain
  // itself to the owner, to the bidder, and to a future regulator.
  reason: z.string().trim().min(3).max(500),
});

/**
 * Staff decision on a bidder: approve / reject / suspend. Owner and staff
 * roles only — the developer-admin role can operate the platform but cannot
 * decide who bids. Effective immediately: the BidderResolver re-reads the
 * bidder row on every request, so a suspension lands mid-auction.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await ensureReady();
    const role = await getStaffSessionRole(request.headers.get("cookie"));
    if (!canDecideBidders(role)) {
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
    const store = new AppwriteBidderStore();
    const bidder = await decideBidder(
      store,
      id,
      parsed.data.decision,
      parsed.data.reason,
      staffActor(role as string),
    );
    if (!bidder) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({
      ok: true,
      bidder: { id: bidder.id, status: bidder.status, statusReason: bidder.statusReason },
    });
  } catch (error) {
    console.error("[staff/bidders/decision] failed:", error);
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
