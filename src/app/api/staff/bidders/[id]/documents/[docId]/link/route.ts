import { NextRequest, NextResponse } from "next/server";
import { ensureReady } from "@/lib/appwrite";
import { AppwriteBidderStore } from "@/lib/bidders/appwrite-store";
import { canReviewBidders } from "@/lib/bidders/authz";
import { DOCUMENT_LINK_TTL_MS, mintDocumentLink } from "@/lib/bidders/documents";
import { getStaffSessionRole, staffActor } from "@/lib/staff-auth";

export const runtime = "nodejs";

/**
 * Mint a short-lived (5 min) signed view URL for one KYC document. The URL is
 * bound to the document, the bidder, the staff actor and the expiry; the view
 * route audits every use. This endpoint never returns file bytes itself.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string; docId: string }> },
) {
  try {
    await ensureReady();
    const role = await getStaffSessionRole(request.headers.get("cookie"));
    if (!canReviewBidders(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id, docId } = await context.params;
    const store = new AppwriteBidderStore();
    const document = await store.getDocument(docId);
    if (!document || document.bidderId !== id) {
      // Cross-bidder document ids must not resolve — no IDOR oracle.
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const exp = Date.now() + DOCUMENT_LINK_TTL_MS;
    const { token, sig } = mintDocumentLink({
      docId: document.id,
      bidderId: id,
      staff: staffActor(role as string),
      exp,
    });
    const url = `/api/staff/bidders/${encodeURIComponent(id)}/documents/${encodeURIComponent(docId)}/view?token=${encodeURIComponent(token)}&sig=${encodeURIComponent(sig)}`;
    return NextResponse.json(
      { ok: true, url, expiresAt: new Date(exp).toISOString() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[staff/bidders/documents/link] failed:", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
