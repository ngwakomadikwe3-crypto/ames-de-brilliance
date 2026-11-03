import { NextRequest, NextResponse } from "next/server";
import { ensureReady, getStorage, LOT_COMPLIANCE_BUCKET } from "@/lib/appwrite";
import { AppwriteLotStore } from "@/lib/lots/appwrite-store";
import { verifyComplianceLink } from "@/lib/lots/compliance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Serve one lot compliance document through a short-lived signed link.
 * Mirrors the buyer KYC document view route: the signature binds the token
 * to the lot id, document id, staff actor and expiry; the path ids must
 * match the signed payload (no IDOR); the stored content type comes from
 * magic-byte sniffing at upload; and EVERY successful view is written to
 * the audit log BEFORE the bytes are sent.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string; docId: string }> },
) {
  try {
    await ensureReady();
    const { id, docId } = await context.params;
    const url = new URL(request.url);
    const payload = verifyComplianceLink(url.searchParams.get("token") ?? "", url.searchParams.get("sig") ?? "");
    if (!payload || payload.docId !== docId || payload.lotId !== id) {
      return NextResponse.json({ ok: false, error: "invalid_or_expired_link" }, { status: 403 });
    }

    const store = new AppwriteLotStore();
    const doc = await store.getComplianceDoc(docId);
    if (!doc || doc.lotId !== id) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }

    // Audit FIRST: a served view is never unaudited, even if streaming fails.
    await store.appendAudit({
      entity: "lot",
      entityId: id,
      action: "lot.compliance_viewed",
      actor: payload.staff,
      detail: JSON.stringify({ docId, docType: doc.docType, filename: doc.filename }),
      createdAt: new Date().toISOString(),
    });

    const storage = getStorage();
    const bytes = new Uint8Array(await storage.getFileDownload({ bucketId: LOT_COMPLIANCE_BUCKET, fileId: doc.fileId }));
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": doc.contentType || "application/octet-stream",
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": `inline; filename="${doc.filename.replace(/"/g, "")}"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("[staff/lots/compliance/view] failed:", error);
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
