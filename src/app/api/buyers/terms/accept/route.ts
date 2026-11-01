import { NextRequest, NextResponse } from "next/server";
import { ensureReady } from "@/lib/appwrite";
import { AppwriteBuyerStore } from "@/lib/buyers/appwrite-store";
import { acceptTerms } from "@/lib/buyers/service";
import { buyerTokenFromCookieHeader, verifyBuyerSession } from "@/lib/buyers/session";
import { BUYER_TERMS_VERSION } from "@/lib/buyers/terms";

export const runtime = "nodejs";

/** Accept the current buyer terms (required again after each version bump). */
export async function POST(request: NextRequest) {
  try {
    await ensureReady();
    const session = await verifyBuyerSession(buyerTokenFromCookieHeader(request.headers.get("cookie")));
    if (!session) {
      return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
    }
    const store = new AppwriteBuyerStore();
    const ok = await acceptTerms(store, session.buyerId);
    if (!ok) {
      return NextResponse.json({ ok: false, error: "buyer_not_found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, termsVersion: BUYER_TERMS_VERSION });
  } catch (error) {
    console.error("[buyers/terms] failed:", error);
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
