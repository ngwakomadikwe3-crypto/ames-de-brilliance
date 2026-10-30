import { NextRequest, NextResponse } from "next/server";
import { ensureReady } from "@/lib/appwrite";
import { AppwriteBidderStore } from "@/lib/bidders/appwrite-store";
import { canDecideBidders } from "@/lib/bidders/authz";
import { exportBidderData } from "@/lib/bidders/service";
import { getStaffSessionRole, staffActor } from "@/lib/staff-auth";

export const runtime = "nodejs";

/**
 * Data export (access request): everything we hold about the bidder as a
 * JSON download. The export itself is audited (bidder.data_exported) with
 * the staff actor and timestamp. Bid rows stay retrievable via the audit
 * trail / bids table by bidder id — they hold no PII by design.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await ensureReady();
    const role = await getStaffSessionRole(request.headers.get("cookie"));
    if (!canDecideBidders(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await context.params;
    const store = new AppwriteBidderStore();
    const data = await exportBidderData(store, id, staffActor(role as string));
    if (!data) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="bidder-${id}-export.json"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("[staff/bidders/export] failed:", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
