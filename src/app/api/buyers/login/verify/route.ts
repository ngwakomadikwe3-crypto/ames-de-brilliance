import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ensureReady } from "@/lib/appwrite";
import { AppwriteBuyerStore } from "@/lib/buyers/appwrite-store";
import { verifyOtp } from "@/lib/buyers/otp";
import { buyerStatusMessage } from "@/lib/buyers/service";
import { createBuyerSessionCookie } from "@/lib/buyers/session";

export const runtime = "nodejs";

const VerifySchema = z.object({
  email: z.string().trim().email().max(320),
  code: z.string().trim().regex(/^\d{6}$/),
});

/**
 * Verify a login code and mint the adb_buyer session cookie. Failed attempts
 * are audited (buyer.login_failed) and count against the code's attempt
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

    const store = new AppwriteBuyerStore();
    const email = parsed.data.email.toLowerCase();
    const buyer = await store.getBuyerByEmail(email);
    if (!buyer || buyer.anonymisedAt) {
      return NextResponse.json({ ok: false, error: "invalid_code" }, { status: 401 });
    }

    const result = await verifyOtp(store, email, parsed.data.code);
    if (result !== "ok") {
      await store.appendAudit({
        entity: "buyer",
        entityId: buyer.id,
        action: "buyer.login_failed",
        actor: buyer.id,
        detail: JSON.stringify({ reason: result }),
        createdAt: new Date().toISOString(),
      });
      return NextResponse.json({ ok: false, error: "invalid_code" }, { status: 401 });
    }

    const cookie = await createBuyerSessionCookie(buyer.id, request.nextUrl.protocol === "https:");
    if (!cookie) {
      return NextResponse.json({ ok: false, error: "session_unavailable" }, { status: 500 });
    }

    await store.appendAudit({
      entity: "buyer",
      entityId: buyer.id,
      action: "buyer.login",
      actor: buyer.id,
      detail: JSON.stringify({ via: "email-otp" }),
      createdAt: new Date().toISOString(),
    });

    const status = buyerStatusMessage(buyer);
    const response = NextResponse.json({
      ok: true,
      buyerId: buyer.id,
      status: buyer.status,
      message: status.message,
    });
    response.headers.set("Set-Cookie", cookie);
    return response;
  } catch (error) {
    console.error("[buyers/verify] failed:", error);
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
