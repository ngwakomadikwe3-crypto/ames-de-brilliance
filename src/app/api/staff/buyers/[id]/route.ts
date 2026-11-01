import { NextRequest, NextResponse } from "next/server";
import { ensureReady } from "@/lib/appwrite";
import { AppwriteBuyerStore } from "@/lib/buyers/appwrite-store";
import { canReviewBuyers } from "@/lib/buyers/authz";
import { getStaffSessionRole } from "@/lib/staff-auth";

export const runtime = "nodejs";

/** Single buyer detail (PII + document metadata) for the review drawer. */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await ensureReady();
    const role = await getStaffSessionRole(request.headers.get("cookie"));
    if (!canReviewBuyers(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await context.params;
    const store = new AppwriteBuyerStore();
    const buyer = await store.getBuyer(id);
    if (!buyer) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const documents = await store.listDocuments(buyer.id);
    return NextResponse.json(
      { ok: true, buyer, documents },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[staff/buyers/[id]] fetch failed:", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
