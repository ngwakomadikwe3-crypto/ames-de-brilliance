import { NextResponse } from "next/server";
import { bidderWire } from "../../../../../lib/bidders/wire";
import { bidderTokenFromCookieHeader, verifyBidderToken } from "../../../../../lib/bidders/session";
import { AppwriteKycStorage } from "../../../../../lib/bidders/appwrite-kyc";
import { newDocumentId } from "../../../../../lib/bidders/appwrite-directory";
import { KYC_UPLOAD_LIMIT_PER_DAY, validateUpload } from "../../../../../lib/bidders/kyc";

export const runtime = "nodejs";

async function bidderIdFrom(req: Request): Promise<string | null> {
  const token = bidderTokenFromCookieHeader(req.headers.get("cookie"));
  return token ? verifyBidderToken(token) : null;
}

/** List the signed-in bidder's own documents (metadata only, never bytes). */
export async function GET(req: Request) {
  const bidderId = await bidderIdFrom(req);
  if (!bidderId) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  const { directory } = bidderWire();
  const bidder = await directory.getBidder(bidderId);
  if (!bidder || bidder.anonymisedAt) {
    return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }
  const documents = await directory.listDocuments(bidderId);
  return NextResponse.json({
    ok: true,
    documents: documents.map((d) => ({
      id: d.id,
      fileName: d.fileName,
      contentType: d.contentType,
      sizeBytes: d.sizeBytes,
      createdAt: d.createdAt,
    })),
  });
}

/**
 * Upload a KYC document: multipart form with a single `file` field.
 * Allow-listed types only, size-capped, stored in the private bucket; the
 * metadata row references the file id. Shared-store rate limit per bidder.
 */
export async function POST(req: Request) {
  const bidderId = await bidderIdFrom(req);
  if (!bidderId) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  const wire = bidderWire();
  const bidder = await wire.directory.getBidder(bidderId);
  if (!bidder || bidder.anonymisedAt) {
    return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }
  if (bidder.status === "suspended" || bidder.status === "rejected") {
    return NextResponse.json({ ok: false, error: "upload_not_allowed" }, { status: 403 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "file_required" }, { status: 400 });
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = validateUpload(file.name, file.type, bytes.byteLength);
  if (!check.ok) {
    return NextResponse.json({ ok: false, error: check.reason }, { status: 400 });
  }

  const allowed = await wire.limiter.hit(`bidder:kyc:${bidderId}`, 86400, KYC_UPLOAD_LIMIT_PER_DAY, new Date());
  if (!allowed) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  const storage = new AppwriteKycStorage();
  const fileId = newDocumentId();
  await storage.createFile(fileId, bytes, file.name, file.type);
  const now = new Date();
  const doc = {
    id: fileId,
    bidderId,
    fileId,
    fileName: file.name,
    contentType: file.type,
    sizeBytes: bytes.byteLength,
    createdAt: now.toISOString(),
  };
  await wire.directory.addDocument(doc);
  await wire.audit({
    entity: "bidder",
    entityId: bidderId,
    action: "bidder.doc_uploaded",
    actor: bidderId,
    detail: { documentId: doc.id, fileName: doc.fileName, sizeBytes: doc.sizeBytes },
    now,
  });
  return NextResponse.json({ ok: true, document: { id: doc.id, fileName: doc.fileName } }, { status: 201 });
}
