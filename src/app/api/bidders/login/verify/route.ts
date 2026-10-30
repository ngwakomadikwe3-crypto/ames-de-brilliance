import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ensureReady } from "@/lib/appwrite";
import { AppwriteBidderStore } from "@/lib/bidders/appwrite-store";
import { verifyOtp } from "@/lib/bidders/otp";
import { bidderStatusMessage } from "@/lib/bidders/service";
import { createBidderSessionCookie } from "@/lib/bidders/session";

export const runtime = "nodejs";

const VerifySchema = z.object({
  email: z.string().trim().email().max(320),
  code: z.string().trim().regex(/^\d{6}$/),
});

/**
 * Verify a login code and mint the adb_bidder session cookie. Failed attempts
 * are audited (bidder.login_failed) and count against the code's attempt
 * limit inside verifyOtp — shared storage, so brute force cannot scale
 * across instances.
 */
export async function POST(request: NextRequest) {
  try {
    await ensureReady();

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
    }
    const parsed = VerifySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
    }

    const store = new AppwriteBidderStore();
    const email = parsed.data.email.toLowerCase();
    const bidder = await store.getBidderByEmail(email);
    if (!bidder || bidder.anonymisedAt) {
      return NextResponse.json({ ok: false, error: "invalid_code" }, { status: 401 });
    }

    const result = await verifyOtp(store, email, parsed.data.code);
    if (result !== "ok") {
      await store.appendAudit({
        entity: "bidder",
        entityId: bidder.id,
        action: "bidder.login_failed",
        actor: bidder.id,
        detail: JSON.stringify({ reason: result }),
        createdAt: new Date().toISOString(),
      });
      return NextResponse.json({ ok: false, error: "invalid_code" }, { status: 401 });
    }

    const cookie = await createBidderSessionCookie(bidder.id, request.nextUrl.protocol === "https:");
    if (!cookie) {
      return NextResponse.json({ ok: false, error: "session_unavailable" }, { status: 500 });
    }

    await store.appendAudit({
      entity: "bidder",
      entityId: bidder.id,
      action: "bidder.login",
      actor: bidder.id,
      detail: JSON.stringify({ via: "email-otp" }),
      createdAt: new Date().toISOString(),
    });

    const status = bidderStatusMessage(bidder);
    const response = NextResponse.json({
      ok: true,
      bidderId: bidder.id,
      status: bidder.status,
      message: status.message,
    });
    response.headers.set("Set-Cookie", cookie);
    return response;
  } catch (error) {
    console.error("[bidders/verify] failed:", error);
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
