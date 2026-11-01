import { NextRequest, NextResponse } from "next/server";
import { ensureReady } from "@/lib/appwrite";
import { cataloguePublicAccessEnabled } from "@/lib/buyers/access";
import { AppwriteBuyerStore } from "@/lib/buyers/appwrite-store";
import { buyerMayOffer, buyerStatusMessage } from "@/lib/buyers/service";
import { buyerTokenFromCookieHeader, verifyBuyerSession } from "@/lib/buyers/session";
import { BUYER_TERMS_VERSION } from "@/lib/buyers/terms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The caller's own buyer profile and standing. Powers the /buyer account page
 * (pending / rejected / suspended / terms-stale / licence-expired). Returns
 * only the session owner's data — there is no way to read another buyer here.
 */
export async function GET(request: NextRequest) {
  try {
    await ensureReady();
    const session = await verifyBuyerSession(buyerTokenFromCookieHeader(request.headers.get("cookie")));
    if (!session) {
      return NextResponse.json(
        { ok: true, authenticated: false, cataloguePublicAccess: cataloguePublicAccessEnabled() },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const store = new AppwriteBuyerStore();
    const buyer = await store.getBuyer(session.buyerId);
    if (!buyer || buyer.anonymisedAt) {
      return NextResponse.json(
        { ok: true, authenticated: false, cataloguePublicAccess: cataloguePublicAccessEnabled() },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const status = buyerStatusMessage(buyer);
    return NextResponse.json(
      {
        ok: true,
        authenticated: true,
        cataloguePublicAccess: cataloguePublicAccessEnabled(),
        buyer: {
          id: buyer.id,
          name: buyer.name,
          email: buyer.email,
          entityType: buyer.entityType,
          status: buyer.status,
          termsCurrent: buyer.termsVersion === BUYER_TERMS_VERSION,
          licenceExpiry: buyer.licenceExpiry,
          mayOffer: buyerMayOffer(buyer),
        },
        state: status.state,
        message: status.message,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[buyers/me] failed:", error);
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
