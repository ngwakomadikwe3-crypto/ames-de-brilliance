import { NextRequest, NextResponse } from "next/server";
import { ensureReady } from "@/lib/appwrite";
import { AppwriteBuyerStore } from "@/lib/buyers/appwrite-store";
import { canDecideBuyers } from "@/lib/buyers/authz";
import { exportBuyerData } from "@/lib/buyers/service";
import { getStaffSessionRole, staffActor } from "@/lib/staff-auth";

export const runtime = "nodejs";

/**
 * Data export (access request): everything we hold about the buyer as a
 * JSON download. The export itself is audited (buyer.data_exported) with
 * the staff actor and timestamp. Offer/deal rows stay retrievable via the
 * audit trail by buyer id — they hold no PII by design.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await ensureReady();
    const role = await getStaffSessionRole(request.headers.get("cookie"));
    if (!canDecideBuyers(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await context.params;
    const store = new AppwriteBuyerStore();
    const data = await exportBuyerData(store, id, staffActor(role as string));
    if (!data) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="buyer-${id}-export.json"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("[staff/buyers/export] failed:", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
