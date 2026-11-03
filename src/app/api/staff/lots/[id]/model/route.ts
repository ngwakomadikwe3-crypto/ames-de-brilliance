import { NextRequest, NextResponse } from "next/server";
import { ID } from "node-appwrite";
import { InputFile } from "node-appwrite/file";
import { ensureReady, getStorage, LOT_MODELS_BUCKET } from "@/lib/appwrite";
import { getStaffSessionRole, staffActor } from "@/lib/staff-auth";
import { canManageLots } from "@/lib/lots/authz";
import { AppwriteLotStore } from "@/lib/lots/appwrite-store";
import { editLot } from "@/lib/lots/service";
import { LotTransitionError } from "@/lib/lots/types";
import { isGlb, lotModelMaxBytes, verifyUploadTicket } from "@/lib/lots/model";
import { sha256Hex } from "@/lib/lots/compliance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Lot GLB model upload (STEP d1, amendment 8 as adapted — server-mediated,
 * see lots/model.ts). The POST requires a valid upload ticket from
 * POST /api/staff/lots/[id]/model-ticket bound to this lot; the file must
 * pass the glTF binary magic-byte + version check and the configurable size
 * cap. A new model REPLACES the old one (old file deleted, outstanding
 * signed view links die because they bind the previous file id). Setting the
 * model is a MATERIAL change: editLot demotes an approved/published lot to
 * pending_review (amendment 6).
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await ensureReady();
    const { id } = await context.params;
    const url = new URL(request.url);
    const ticket = verifyUploadTicket(url.searchParams.get("token") ?? "", url.searchParams.get("sig") ?? "");
    if (!ticket || ticket.lotId !== id) {
      return NextResponse.json({ ok: false, error: "invalid_or_expired_ticket" }, { status: 403 });
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
    const maxBytes = lotModelMaxBytes();
    if (file.size <= 0 || file.size > maxBytes) {
      return NextResponse.json({ ok: false, error: "file_too_large", maxBytes }, { status: 400 });
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!isGlb(bytes)) {
      return NextResponse.json({ ok: false, error: "not_a_glb" }, { status: 400 });
    }

    const store = new AppwriteLotStore();
    const lot = await store.getLot(id);
    if (!lot) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }

    const storage = getStorage();
    const fileId = ID.unique();
    const safeName = (file.name || `lot-${lot.lotNo}.glb`).replace(/[^\w. -]/g, "_").slice(0, 255);
    await storage.createFile({
      bucketId: LOT_MODELS_BUCKET,
      fileId,
      file: InputFile.fromBuffer(Buffer.from(bytes), safeName),
    });

    const updated = await editLot(store, id, { modelFileId: fileId }, ticket.staff);
    if (lot.modelFileId) {
      try {
        await storage.deleteFile({ bucketId: LOT_MODELS_BUCKET, fileId: lot.modelFileId });
      } catch { /* orphan bytes are harmless; no row references them anymore */ }
    }
    await store.appendAudit({
      entity: "lot",
      entityId: id,
      action: "lot.model_uploaded",
      actor: ticket.staff,
      detail: JSON.stringify({ fileId, filename: safeName, size: bytes.byteLength, sha256: sha256Hex(bytes) }),
      createdAt: new Date().toISOString(),
    });
    return NextResponse.json({ ok: true, fileId, lot: updated }, { status: 201 });
  } catch (error) {
    if (error instanceof LotTransitionError) {
      return NextResponse.json({ ok: false, error: error.code, detail: error.detail ?? null }, { status: 400 });
    }
    console.error("[staff/lots/model] upload failed:", error);
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}

/** Remove the lot's model (photos-only lot). Staff session required. */
export async function DELETE(
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
    const store = new AppwriteLotStore();
    const lot = await store.getLot(id);
    if (!lot) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    if (!lot.modelFileId) {
      return NextResponse.json({ ok: true, lot });
    }

    const actor = staffActor(role as string);
    const updated = await editLot(store, id, { modelFileId: "" }, actor);
    try {
      await getStorage().deleteFile({ bucketId: LOT_MODELS_BUCKET, fileId: lot.modelFileId });
    } catch { /* already gone */ }
    await store.appendAudit({
      entity: "lot",
      entityId: id,
      action: "lot.model_removed",
      actor,
      detail: JSON.stringify({ fileId: lot.modelFileId }),
      createdAt: new Date().toISOString(),
    });
    return NextResponse.json({ ok: true, lot: updated });
  } catch (error) {
    if (error instanceof LotTransitionError) {
      return NextResponse.json({ ok: false, error: error.code, detail: error.detail ?? null }, { status: 400 });
    }
    console.error("[staff/lots/model] delete failed:", error);
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
