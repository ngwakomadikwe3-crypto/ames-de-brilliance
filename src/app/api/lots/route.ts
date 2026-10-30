import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ensureReady } from "@/lib/appwrite";
import { AppwriteAuctionStore } from "@/lib/auction/appwrite-store";
import { defaultBidderResolver } from "@/lib/auction/auth";
import { biddingEnabledFor } from "@/lib/auction/bid-gate";
import { listLotsResolved } from "@/lib/auction/place-bid";
import { projectLot, reserveMetVisibleFromEnv } from "@/lib/auction/public-projection";
import { sessionTokenFromCookieHeader, verifySession } from "@/lib/session";
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

    // The resolver doubles as the "can this browser bid?" signal: the UI
    // enables the bid modal only when the API says the session would be
    // accepted by the same gates the POST route enforces. The staff house
    // identity is always bid-capable; a bidder account needs the public
    // bidding flag ON, verified status and the current terms accepted.
    const bidder = await defaultBidderResolver.resolve(request.headers.get("cookie"));
    const biddingEnabled = biddingEnabledFor(bidder);

    const store = new AppwriteAuctionStore();
    let lots = await listLotsResolved(store);

    if (parsed.data.all === "1") {
      const token = sessionTokenFromCookieHeader(request.headers.get("cookie"));
      if (!token || !(await verifySession(token))) {
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
        biddingEnabled,
        reserveMetVisible: showReserveMet,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[lots] list failed:", error);
    return NextResponse.json({ error: "Failed to list lots" }, { status: 500 });
  }
}
