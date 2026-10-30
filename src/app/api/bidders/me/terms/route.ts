import { NextResponse } from "next/server";
import { bidderWire } from "../../../../../lib/bidders/wire";
import { bidderTokenFromCookieHeader, verifyBidderToken } from "../../../../../lib/bidders/session";
import { acceptCurrentTerms } from "../../../../../lib/bidders/service";

export const runtime = "nodejs";

/** Record acceptance of the current terms version for the signed-in bidder. */
export async function POST(req: Request) {
  const token = bidderTokenFromCookieHeader(req.headers.get("cookie"));
  const bidderId = token ? verifyBidderToken(token) : null;
  if (!bidderId) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  const wire = bidderWire();
  const result = await acceptCurrentTerms(wire.directory, bidderId, new Date(), wire.audit);
  return NextResponse.json(result, { status: result.ok ? 200 : 404 });
}
