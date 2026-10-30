import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ensureReady } from "@/lib/appwrite";
import { AppwriteAuctionStore } from "@/lib/auction/appwrite-store";
import { defaultBidderResolver } from "@/lib/auction/auth";
import { listLotsResolved } from "@/lib/auction/place-bid";
import { projectLot, reserveMetVisibleFromEnv } from "@/lib/auction/public-projection";
import { sessionTokenFromCookieHeader, verifyStaffSession } from "@/lib/session";
import type { LotStatus } from "@/lib/auction/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  all: z.enum(["1"]).optional(),
});

// Public auction browsing shows these; draft/withdrawn require staff session.
const PUBLIC_STATUSES: readonly LotStatus[] = ["scheduled", "live", "closing", "sold", "unsold"];

export async function GET(request: NextRequest) {
  try {
    await ensureReady();
    const parsed = QuerySchema.safeParse({
      all: new URL(request.url).searchParams.get("all") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query", issues: parsed.error.issues }, { status: 400 });
    }

    // The resolved session doubles as the "can this browser bid?" signal:
    // staff always; bidder accounts when AUCTION_PUBLIC_BIDDING=1 and their
    // status is verified and their terms acceptance is current. Everyone else
    // gets the register-to-bid / sign-in flow on the homepage.
    const bidder = await defaultBidderResolver.resolve(request.headers.get("cookie"));

    const store = new AppwriteAuctionStore();
    let lots = await listLotsResolved(store);

    if (parsed.data.all === "1") {
      // Full catalogue (draft/withdrawn) is staff-only: requires the role
      // claim, so a signed bidder cookie cannot widen read access.
      const token = sessionTokenFromCookieHeader(request.headers.get("cookie"));
      if (!token || !(await verifyStaffSession(token))) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    } else {
      lots = lots.filter((lot) => PUBLIC_STATUSES.includes(lot.status));
    }

    // Public projection: reserve amounts and bidder identities never leave the
    // server. `serverTime` lets the client correct its clock for countdowns.
    const showReserveMet = reserveMetVisibleFromEnv();
    return NextResponse.json(
      {
        lots: lots.map((lot) => projectLot(lot, { showReserveMet })),
        serverTime: new Date().toISOString(),
        biddingEnabled: bidder !== null && bidder.verified && bidder.termsCurrent !== false,
        reserveMetVisible: showReserveMet,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[lots] list failed:", error);
    return NextResponse.json({ error: "Failed to list lots" }, { status: 500 });
  }
}
