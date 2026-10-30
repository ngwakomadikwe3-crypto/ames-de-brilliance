import { NextRequest, NextResponse } from "next/server";
import { ensureReady } from "@/lib/appwrite";
import { AppwriteBidderStore } from "@/lib/bidders/appwrite-store";
import { acceptTerms } from "@/lib/bidders/service";
import { bidderTokenFromCookieHeader, verifyBidderSession } from "@/lib/bidders/session";
import { AUCTION_TERMS_VERSION } from "@/lib/bidders/terms";

export const runtime = "nodejs";

/** Accept the current auction terms (required again after each version bump). */
export async function POST(request: NextRequest) {
  try {
    await ensureReady();
    const session = await verifyBidderSession(bidderTokenFromCookieHeader(request.headers.get("cookie")));
    if (!session) {
      return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
    }
    const store = new AppwriteBidderStore();
    const ok = await acceptTerms(store, session.bid);
    if (!ok) {
      return NextResponse.json({ ok: false, error: "bidder_not_found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, termsVersion: AUCTION_TERMS_VERSION });
  } catch (error) {
    console.error("[bidders/terms] failed:", error);
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
