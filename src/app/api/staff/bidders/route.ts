import { NextRequest, NextResponse } from "next/server";
import { ensureReady } from "@/lib/appwrite";
import { AppwriteBidderStore } from "@/lib/bidders/appwrite-store";
import { canReviewBidders } from "@/lib/bidders/authz";
import type { Bidder } from "@/lib/bidders/types";
import { getStaffSessionRole } from "@/lib/staff-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Shape returned to the dashboard review queue (PII included — role-gated). */
function reviewBidder(b: Bidder) {
  return {
    id: b.id,
    name: b.name,
    email: b.email,
    phone: b.phone,
    country: b.country,
    entityType: b.entityType,
    licenceNumber: b.licenceNumber,
    status: b.status,
    statusReason: b.statusReason,
    statusBy: b.statusBy,
    statusAt: b.statusAt,
    termsVersion: b.termsVersion,
    termsAcceptedAt: b.termsAcceptedAt,
    anonymisedAt: b.anonymisedAt,
    createdAt: b.createdAt,
  };
}

const STATUS_ORDER: Record<string, number> = { pending: 0, verified: 1, suspended: 2, rejected: 3 };

/**
 * Review queue for the dashboard: all bidders with their document metadata
 * (never file bytes), pending first, then newest first. Owner and staff only —
 * developer-admin and cousin get 403 by role policy.
 */
export async function GET(request: NextRequest) {
  try {
    await ensureReady();
    const role = await getStaffSessionRole(request.headers.get("cookie"));
    if (!canReviewBidders(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const store = new AppwriteBidderStore();
    const bidders = await store.listBidders();
    const queue = await Promise.all(
      bidders.map(async (b) => ({
        ...reviewBidder(b),
        documents: await store.listDocuments(b.id),
      })),
    );
    queue.sort((a, b) => {
      const byStatus = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
      if (byStatus !== 0) return byStatus;
      return Date.parse(b.createdAt) - Date.parse(a.createdAt);
    });

    return NextResponse.json({ ok: true, bidders: queue }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[staff/bidders] queue failed:", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
