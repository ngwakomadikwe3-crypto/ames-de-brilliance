import { NextRequest, NextResponse } from "next/server";
import { ensureReady } from "@/lib/appwrite";
import { getStaffSessionRole, staffActor } from "@/lib/staff-auth";
import { canManageLots } from "@/lib/lots/authz";
import { AppwriteLotStore } from "@/lib/lots/appwrite-store";
import { COMPLIANCE_LINK_TTL_MS, mintComplianceLink } from "@/lib/lots/compliance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Mint a short-lived (5 min) signed view link for one compliance document.
 * The link binds the lot id, document id, staff actor and expiry; every
 * served view is audited by the view route.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string; docId: string }> },
) {
  try {
    await ensureReady();
    const role = await getStaffSessionRole(request.headers.get("cookie"));
    if (!canManageLots(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id, docId } = await context.params;
    const store = new AppwriteLotStore();
    const doc = await store.getComplianceDoc(docId);
    if (!doc || doc.lotId !== id) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }

    const link = mintComplianceLink({
      lotId: id,
      docId,
      staff: staffActor(role as string),
      exp: Date.now() + COMPLIANCE_LINK_TTL_MS,
    });
    if (!link) {
      return NextResponse.json({ ok: false, error: "signing_unavailable" }, { status: 503 });
    }
    return NextResponse.json(
      { ok: true, url: `/api/staff/lots/${id}/compliance/${docId}/view?token=${link.token}&sig=${link.sig}` },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[staff/lots/compliance/link] failed:", error);
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
