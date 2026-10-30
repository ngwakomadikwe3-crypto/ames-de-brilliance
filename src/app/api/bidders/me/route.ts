import { NextRequest, NextResponse } from "next/server";
import { ensureReady } from "@/lib/appwrite";
import { AppwriteBidderStore } from "@/lib/bidders/appwrite-store";
import { bidderStatusMessage } from "@/lib/bidders/service";
import { bidderTokenFromCookieHeader, verifyBidderSession } from "@/lib/bidders/session";
import { AUCTION_TERMS_VERSION } from "@/lib/bidders/terms";
import { publicBiddingEnabled } from "@/lib/auction/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The caller's own bidder profile and standing. Powers the homepage status
 * messages (pending / rejected / suspended / terms-stale). Returns only the
 * session owner's data — there is no way to read another bidder here.
 */
export async function GET(request: NextRequest) {
  try {
    await ensureReady();
    const session = await verifyBidderSession(bidderTokenFromCookieHeader(request.headers.get("cookie")));
    if (!session) {
      return NextResponse.json(
        { ok: true, authenticated: false, publicBidding: publicBiddingEnabled() },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const store = new AppwriteBidderStore();
    const bidder = await store.getBidder(session.bid);
    if (!bidder || bidder.anonymisedAt) {
      return NextResponse.json(
        { ok: true, authenticated: false, publicBidding: publicBiddingEnabled() },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const status = bidderStatusMessage(bidder);
    return NextResponse.json(
      {
        ok: true,
        authenticated: true,
        publicBidding: publicBiddingEnabled(),
        bidder: {
          id: bidder.id,
          name: bidder.name,
          email: bidder.email,
          entityType: bidder.entityType,
          status: bidder.status,
          termsCurrent: bidder.termsVersion === AUCTION_TERMS_VERSION,
        },
        state: status.state,
        message: status.message,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[bidders/me] failed:", error);
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
