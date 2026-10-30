import { NextResponse } from "next/server";
import { verifyLoginCode } from "../../../../../lib/bidders/service";
import { bidderWire } from "../../../../../lib/bidders/wire";
import { createBidderSessionCookie } from "../../../../../lib/bidders/session";
import { currentTermsVersion, publicBiddingEnabled } from "../../../../../lib/auction/flags";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const wire = bidderWire();
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  const input = (body ?? {}) as { email?: unknown; code?: unknown };
  const result = await verifyLoginCode(wire.directory, wire.limiter, input.email, input.code, new Date());
  if (!result.ok) {
    const status = result.reason === "rate_limited" ? 429 : 400;
    return NextResponse.json(result, { status });
  }
  const bidder = result.bidder;
  const res = NextResponse.json({
    ok: true,
    bidder: {
      id: bidder.id,
      status: bidder.status,
      statusReason: bidder.statusReason,
      termsVersion: bidder.termsVersion,
      currentTermsVersion: currentTermsVersion(),
    },
    publicBidding: publicBiddingEnabled(),
  });
  res.headers.append("Set-Cookie", createBidderSessionCookie(bidder.id));
  return res;
}
