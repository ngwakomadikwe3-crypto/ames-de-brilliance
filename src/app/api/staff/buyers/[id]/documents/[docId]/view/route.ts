import { NextRequest, NextResponse } from "next/server";
import { BUYER_DOCS_BUCKET, ensureReady, getStorage } from "@/lib/appwrite";
import { AppwriteBuyerStore } from "@/lib/buyers/appwrite-store";
import { verifyDocumentLink } from "@/lib/buyers/documents";
import { recordDocumentView } from "@/lib/buyers/service";

export const runtime = "nodejs";

/**
 * Serve one KYC document through a short-lived signed link.
 *
 * Security properties:
 * - the HMAC signature binds the token to the document id, the buyer id, the
 *   staff actor the link was minted for, and a 5-minute expiry;
 * - the path ids must match the signed payload (a link minted for buyer A's
 *   document cannot be replayed under buyer B's path — no IDOR);
 * - the stored content type comes from magic-byte sniffing at upload, never
 *   from the client; nosniff is set and only pdf/image types can exist here;
 * - EVERY successful view is written to the audit log with the staff actor
 *   and timestamp before the bytes are sent — there is no code path that
 *   serves a document without auditing it.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string; docId: string }> },
) {
  try {
    await ensureReady();
    const { id, docId } = await context.params;
    const url = new URL(request.url);
    const payload = verifyDocumentLink(url.searchParams.get("token") ?? "", url.searchParams.get("sig") ?? "");
    if (!payload || payload.docId !== docId || payload.buyerId !== id) {
      return NextResponse.json({ error: "invalid_or_expired_link" }, { status: 403 });
    }

    const store = new AppwriteBuyerStore();
    const document = await store.getDocument(docId);
    if (!document || document.buyerId !== id) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    // Audit FIRST: a served view is never unaudited, even if streaming fails.
    await recordDocumentView(store, {
      buyerId: id,
      documentId: docId,
      filename: document.filename,
      staffActor: payload.staff,
    });

    const storage = getStorage();
    const bytes = new Uint8Array(await storage.getFileDownload({ bucketId: BUYER_DOCS_BUCKET, fileId: document.fileId }));
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": document.contentType || "application/octet-stream",
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": `inline; filename="${document.filename.replace(/"/g, "")}"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("[staff/buyers/documents/view] failed:", error);
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
