import { NextRequest, NextResponse } from "next/server";
import { ensureReady } from "@/lib/appwrite";
import { AppwriteBidderStore } from "@/lib/bidders/appwrite-store";
import { canReviewBidders } from "@/lib/bidders/authz";
import { getStaffSessionRole } from "@/lib/staff-auth";

export const runtime = "nodejs";

/** Single bidder detail (PII + document metadata) for the review drawer. */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await ensureReady();
    const role = await getStaffSessionRole(request.headers.get("cookie"));
    if (!canReviewBidders(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await context.params;
    const store = new AppwriteBidderStore();
    const bidder = await store.getBidder(id);
    if (!bidder) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const documents = await store.listDocuments(bidder.id);
    return NextResponse.json(
      { ok: true, bidder, documents },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[staff/bidders/[id]] fetch failed:", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
