import { NextRequest, NextResponse } from "next/server";
import { ensureReady, getStorage, LOT_COMPLIANCE_BUCKET } from "@/lib/appwrite";
import { getStaffSessionRole, staffActor } from "@/lib/staff-auth";
import { canManageLots } from "@/lib/lots/authz";
import { AppwriteLotStore } from "@/lib/lots/appwrite-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Remove a compliance document (metadata row + bucket bytes). Staff/owner
 * only. Compliance documents are NOT a lot material field — removing one
 * does not demote the lot, but the removal is audited.
 */
export async function DELETE(
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

    const actor = staffActor(role as string);
    await store.deleteComplianceDoc(docId);
    try {
      await getStorage().deleteFile({ bucketId: LOT_COMPLIANCE_BUCKET, fileId: doc.fileId });
    } catch { /* already gone */ }
    await store.appendAudit({
      entity: "lot",
      entityId: id,
      action: "lot.compliance_removed",
      actor,
      detail: JSON.stringify({ docId, docType: doc.docType, filename: doc.filename }),
      createdAt: new Date().toISOString(),
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[staff/lots/compliance] delete failed:", error);
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
