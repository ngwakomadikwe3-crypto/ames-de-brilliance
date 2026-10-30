import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ensureReady } from "@/lib/appwrite";
import { AppwriteAuctionStore } from "@/lib/auction/appwrite-store";
import { defaultBidderResolver } from "@/lib/auction/auth";
import { placeBid } from "@/lib/auction/place-bid";

export const runtime = "nodejs";

const IdSchema = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,35}$/, "invalid lot id");

const BidBodySchema = z.object({
  // Integer minor units in the lot's currency. Never a float.
  amountMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  // Client-generated idempotency key; replays return the original bid.
  idempotencyKey: z.string().min(8).max(200),
});

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await ensureReady();

    const { id } = await context.params;
    const lotId = IdSchema.safeParse(id);
    if (!lotId.success) {
      return NextResponse.json({ ok: false, reason: "invalid_lot_id" }, { status: 400 });
    }

    // Bidder authz: Phase 3a resolves the staff session always, and real
    // bidder accounts when AUCTION_PUBLIC_BIDDING=1. Verified status and
    // suspension are enforced here server-side, never only in the UI.
    const bidder = await defaultBidderResolver.resolve(request.headers.get("cookie"));
    if (!bidder) {
      return NextResponse.json({ ok: false, reason: "unauthenticated" }, { status: 401 });
    }
    // Terms gate (bidder accounts): acceptance of the CURRENT version is
    // required to bid; the resolver reports staleness without failing auth.
    if (bidder.termsCurrent === false) {
      return NextResponse.json({ ok: false, reason: "terms_not_accepted" }, { status: 403 });
    }

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return NextResponse.json({ ok: false, reason: "invalid_json" }, { status: 400 });
    }
    const body = BidBodySchema.safeParse(raw);
    if (!body.success) {
      return NextResponse.json({ ok: false, reason: "invalid_body", issues: body.error.issues }, { status: 400 });
    }

    const store = new AppwriteAuctionStore();
    const result = await placeBid(store, {
      lotId: lotId.data,
      bidder,
      amountMinor: body.data.amountMinor,
      idempotencyKey: body.data.idempotencyKey,
    });

    if (result.status === "accepted") {
      return NextResponse.json(
        { ok: true, bid: result.bid, lot: result.lot, replayed: result.replayed, extended: result.extended },
        { status: result.replayed ? 200 : 201 },
      );
    }

    const status =
      result.reason === "lot_not_found" ? 404
      : result.reason === "rate_limited" ? 429
      : result.reason === "bidder_unverified" ? 403
      : 409;
    return NextResponse.json(
      { ok: false, reason: result.reason, minimumMinor: result.minimumMinor },
      { status },
    );
  } catch (error) {
    console.error("[lots/bids] bid failed:", error);
    return NextResponse.json({ ok: false, reason: "internal_error" }, { status: 500 });
  }
}
