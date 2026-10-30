import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ensureReady } from "@/lib/appwrite";
import { AppwriteAuctionStore } from "@/lib/auction/appwrite-store";
import { listLotsResolved } from "@/lib/auction/place-bid";
import { sessionTokenFromCookieHeader, verifySession } from "@/lib/session";
import type { LotStatus } from "@/lib/auction/types";

export const runtime = "nodejs";

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

    return NextResponse.json({ lots });
  } catch (error) {
    console.error("[lots] list failed:", error);
    return NextResponse.json({ error: "Failed to list lots" }, { status: 500 });
  }
}
