import { NextRequest, NextResponse } from "next/server";
import { ID } from "node-appwrite";
import { InputFile } from "node-appwrite/file";
import { ensureReady, getStorage, LOT_COMPLIANCE_BUCKET } from "@/lib/appwrite";
import { getStaffSessionRole, staffActor } from "@/lib/staff-auth";
import { canManageLots } from "@/lib/lots/authz";
import { AppwriteLotStore } from "@/lib/lots/appwrite-store";
import { COMPLIANCE_MAX_BYTES, sha256Hex, sniffDocumentType } from "@/lib/lots/compliance";
import { COMPLIANCE_DOC_TYPES } from "@/lib/lots/types";
import type { ComplianceDocType } from "@/lib/lots/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/**
 * Lot compliance documents (STEP d1): KP certificates, origin declarations,
 * valuations, assay reports. Staff/owner only. Bytes go to the PRIVATE
 * lot-compliance bucket after magic-byte sniffing; buyers never see these —
 * staff view them through short-lived signed, audited links.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await ensureReady();
    const role = await getStaffSessionRole(request.headers.get("cookie"));
    if (!canManageLots(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await context.params;

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
    const docTypeRaw = String(form.get("docType") ?? "");
    if (!(COMPLIANCE_DOC_TYPES as readonly string[]).includes(docTypeRaw)) {
      return NextResponse.json({ ok: false, error: "unknown_doc_type" }, { status: 400 });
    }
    const notes = String(form.get("notes") ?? "").trim().slice(0, 1000);
    if (file.size <= 0 || file.size > COMPLIANCE_MAX_BYTES) {
      return NextResponse.json({ ok: false, error: "file_too_large", maxBytes: COMPLIANCE_MAX_BYTES }, { status: 400 });
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const kind = sniffDocumentType(bytes);
    if (!kind) {
      return NextResponse.json({ ok: false, error: "unsupported_file_type" }, { status: 400 });
    }

    const store = new AppwriteLotStore();
    const lot = await store.getLot(id);
    if (!lot) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }

    const storage = getStorage();
    const fileId = ID.unique();
    const safeName = (file.name || `document.${kind}`).replace(/[^\w. -]/g, "_").slice(0, 255);
    await storage.createFile({
      bucketId: LOT_COMPLIANCE_BUCKET,
      fileId,
      file: InputFile.fromBuffer(Buffer.from(bytes), safeName),
    });

    const actor = staffActor(role as string);
    const docId = ID.unique();
    const now = new Date().toISOString();
    await store.addComplianceDoc({
      id: docId,
      lotId: id,
      docType: docTypeRaw as ComplianceDocType,
      fileId,
      filename: safeName,
      contentType: MIME[kind],
      size: bytes.byteLength,
      sha256: sha256Hex(bytes),
      notes,
      uploadedBy: actor,
      uploadedAt: now,
    });
    await store.appendAudit({
      entity: "lot",
      entityId: id,
      action: "lot.compliance_uploaded",
      actor,
      detail: JSON.stringify({ docId, docType: docTypeRaw, filename: safeName, size: bytes.byteLength }),
      createdAt: now,
    });

    return NextResponse.json(
      { ok: true, document: { id: docId, docType: docTypeRaw, filename: safeName, contentType: MIME[kind], size: bytes.byteLength } },
      { status: 201 },
    );
  } catch (error) {
    console.error("[staff/lots/compliance] upload failed:", error);
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
