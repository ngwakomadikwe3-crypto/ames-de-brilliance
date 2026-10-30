import { NextRequest, NextResponse } from "next/server";
import { ID } from "node-appwrite";
import { InputFile } from "node-appwrite/file";
import { BIDDER_DOCS_BUCKET, ensureReady, getStorage } from "@/lib/appwrite";
import { AppwriteBidderStore } from "@/lib/bidders/appwrite-store";
import {
  DOCUMENT_MAX_BYTES,
  DOCUMENT_MIME,
  sha256Hex,
  sniffDocumentType,
} from "@/lib/bidders/documents";
import { bidderTokenFromCookieHeader, verifyBidderSession } from "@/lib/bidders/session";

export const runtime = "nodejs";

/**
 * KYC document upload for the signed-in bidder (own documents only — the
 * bidder id comes from the session, never from the request).
 *
 * Malware-safe handling:
 * - the allow-list is enforced by MAGIC BYTES sniffed from the content; the
 *   client-supplied filename/MIME are never trusted for the decision;
 * - files land in the private bidder-docs bucket (no public URLs ever) and
 *   are never executed, never served from a mutable path;
 * - staff access happens only through short-lived signed view URLs, and every
 *   view is audited (see the staff documents/[docId]/view route).
 */
export async function POST(request: NextRequest) {
  try {
    await ensureReady();
    const session = await verifyBidderSession(bidderTokenFromCookieHeader(request.headers.get("cookie")));
    if (!session) {
      return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
    }

    const store = new AppwriteBidderStore();
    const bidder = await store.getBidder(session.bid);
    if (!bidder || bidder.anonymisedAt) {
      return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
    }
    // Suspended accounts are frozen entirely: no new documents either.
    if (bidder.status === "suspended") {
      return NextResponse.json({ ok: false, error: "suspended" }, { status: 403 });
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json({ ok: false, error: "invalid_form" }, { status: 400 });
    }
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "file_required" }, { status: 400 });
    }
    if (file.size <= 0 || file.size > DOCUMENT_MAX_BYTES) {
      return NextResponse.json(
        { ok: false, error: "file_too_large", maxBytes: DOCUMENT_MAX_BYTES },
        { status: 400 },
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const kind = sniffDocumentType(bytes);
    if (!kind) {
      // Anything else — executables, scripts, archives, html — is refused.
      return NextResponse.json({ ok: false, error: "unsupported_file_type" }, { status: 400 });
    }
    const contentType = DOCUMENT_MIME[kind];
    const safeName = (file.name || `document.${kind}`).replace(/[^\w. -]/g, "_").slice(0, 255);

    const storage = getStorage();
    const fileId = ID.unique();
    await storage.createFile({
      bucketId: BIDDER_DOCS_BUCKET,
      fileId,
      file: InputFile.fromBuffer(Buffer.from(bytes), safeName),
    });

    const now = new Date().toISOString();
    const docId = ID.unique();
    await store.addDocument({
      id: docId,
      bidderId: bidder.id,
      fileId,
      filename: safeName,
      contentType,
      size: bytes.byteLength,
      sha256: sha256Hex(bytes),
      uploadedAt: now,
    });
    await store.appendAudit({
      entity: "bidder",
      entityId: bidder.id,
      action: "bidder.document_uploaded",
      actor: bidder.id,
      detail: JSON.stringify({ documentId: docId, filename: safeName, contentType, size: bytes.byteLength }),
      createdAt: now,
    });

    return NextResponse.json(
      { ok: true, document: { id: docId, filename: safeName, contentType, size: bytes.byteLength } },
      { status: 201 },
    );
  } catch (error) {
    console.error("[bidders/documents] upload failed:", error);
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
