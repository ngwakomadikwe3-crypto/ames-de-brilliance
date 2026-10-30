import { NextRequest, NextResponse } from "next/server";
import { ensureReady } from "@/lib/appwrite";
import { AppwriteAuctionStore } from "@/lib/auction/appwrite-store";
import { defaultBidderResolver } from "@/lib/auction/auth";
import { sweepExpiredLots } from "@/lib/auction/sweeper";
import { sendMail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cron sweeper for the auction engine (Phase 2b).
 *
 * Closes every lot past closesAt using the same lazy-close transactional path
 * bids and reads use, then sends winner/house close notifications. Idempotent
 * and safe to run concurrently with traffic: the second runner simply finds
 * no due transitions and skips lots already notified.
 *
 * Auth: CRON_SECRET bearer. Vercel automatically sends
 * `Authorization: Bearer $CRON_SECRET` on cron invocations when the env var
 * is set. The route refuses to run (500) when CRON_SECRET is unset, so it can
 * never be an unauthenticated public endpoint by misconfiguration.
 *
 * Note: the sweeper is belt-and-braces. Correctness never depends on it —
 * every read/bid lazily closes due lots in the same transaction.
 */
async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "cron_not_configured" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    await ensureReady();
    const store = new AppwriteAuctionStore();
    const summary = await sweepExpiredLots(store, {
      notify: {
        sendMail,
        houseEmail: process.env.NOTIFY_EMAIL || process.env.SMTP_USER || "",
        resolveWinnerEmail: (bidderId) =>
          defaultBidderResolver.resolveEmail?.(bidderId) ?? Promise.resolve(null),
      },
    });
    return NextResponse.json({ ok: true, ...summary, serverTime: new Date().toISOString() });
  } catch (error) {
    console.error("[cron/close-lots] sweep failed:", error);
    return NextResponse.json({ ok: false, error: "sweep_failed" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
