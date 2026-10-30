import { NextResponse } from "next/server";
import { bidderWire } from "../../../../lib/bidders/wire";
import { bidderTokenFromCookieHeader, verifyBidderToken } from "../../../../lib/bidders/session";
import { currentTermsVersion, publicBiddingEnabled } from "../../../../lib/auction/flags";
import { bidderMayBid } from "../../../../lib/bidders/service";

export const runtime = "nodejs";

/** Current bidder identity: profile status, terms state, whether bidding is open to them. */
export async function GET(req: Request) {
  const token = bidderTokenFromCookieHeader(req.headers.get("cookie"));
  const bidderId = token ? verifyBidderToken(token) : null;
  if (!bidderId) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  const { directory } = bidderWire();
  const bidder = await directory.getBidder(bidderId);
  if (!bidder || bidder.anonymisedAt) {
    return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }
  const terms = currentTermsVersion();
  const flag = publicBiddingEnabled();
  return NextResponse.json({
    ok: true,
    bidder: {
      id: bidder.id,
      name: bidder.name,
      email: bidder.email,
      status: bidder.status,
      statusReason: bidder.statusReason,
      termsVersion: bidder.termsVersion,
      currentTermsVersion: terms,
      termsAccepted: bidder.termsVersion === terms,
      mayBid: bidderMayBid(bidder, flag, terms),
    },
    publicBidding: flag,
  });
}
