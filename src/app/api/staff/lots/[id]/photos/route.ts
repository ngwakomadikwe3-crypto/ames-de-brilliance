import { NextRequest, NextResponse } from "next/server";
import { ID } from "node-appwrite";
import { InputFile } from "node-appwrite/file";
import { ensureReady, getStorage, LOT_PHOTOS_BUCKET } from "@/lib/appwrite";
import { getStaffSessionRole, staffActor } from "@/lib/staff-auth";
import { canManageLots } from "@/lib/lots/authz";
import { AppwriteLotStore } from "@/lib/lots/appwrite-store";
import { editLot } from "@/lib/lots/service";
import { LotTransitionError } from "@/lib/lots/types";
import { sha256Hex, sniffDocumentType } from "@/lib/lots/compliance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PHOTO_MAX_BYTES = 20 * 1024 * 1024;
const PHOTO_MIME: Record<string, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/**
 * Lot photography (STEP d1). Staff/owner upload; bytes are magic-byte
 * sniffed (jpeg/png/webp only — never pdf here), stored in the server-only
 * lot-photos bucket and served to browsers through the gated
 * /api/lots/[id]/photo/[fileId] proxy. Adding or removing a photo is a
 * MATERIAL change: editLot demotes an approved/published lot to
 * pending_review (amendment 6).
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
    if (file.size <= 0 || file.size > PHOTO_MAX_BYTES) {
      return NextResponse.json({ ok: false, error: "file_too_large", maxBytes: PHOTO_MAX_BYTES }, { status: 400 });
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const kind = sniffDocumentType(bytes);
    if (!kind || !(kind in PHOTO_MIME)) {
      return NextResponse.json({ ok: false, error: "unsupported_file_type" }, { status: 400 });
    }

    const store = new AppwriteLotStore();
    const lot = await store.getLot(id);
    if (!lot) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }

    const storage = getStorage();
    const fileId = ID.unique();
    const safeName = (file.name || `photo.${kind}`).replace(/[^\w. -]/g, "_").slice(0, 255);
    await storage.createFile({
      bucketId: LOT_PHOTOS_BUCKET,
      fileId,
      file: InputFile.fromBuffer(Buffer.from(bytes), safeName),
    });

    const actor = staffActor(role as string);
    const updated = await editLot(store, id, { photoFileIds: [...lot.photoFileIds, fileId] }, actor);
    await store.appendAudit({
      entity: "lot",
      entityId: id,
      action: "lot.photo_added",
      actor,
      detail: JSON.stringify({ fileId, filename: safeName, contentType: PHOTO_MIME[kind], size: bytes.byteLength, sha256: sha256Hex(bytes) }),
      createdAt: new Date().toISOString(),
    });
    return NextResponse.json({ ok: true, fileId, lot: updated }, { status: 201 });
  } catch (error) {
    if (error instanceof LotTransitionError) {
      return NextResponse.json({ ok: false, error: error.code, detail: error.detail ?? null }, { status: 400 });
    }
    console.error("[staff/lots/photos] upload failed:", error);
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}

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
    const fileId = new URL(request.url).searchParams.get("fileId") ?? "";
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,35}$/.test(fileId)) {
      return NextResponse.json({ ok: false, error: "invalid_file_id" }, { status: 400 });
    }

    const store = new AppwriteLotStore();
    const lot = await store.getLot(id);
    if (!lot) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    if (!lot.photoFileIds.includes(fileId)) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }

    const actor = staffActor(role as string);
    const updated = await editLot(store, id, { photoFileIds: lot.photoFileIds.filter((f) => f !== fileId) }, actor);
    try {
      await getStorage().deleteFile({ bucketId: LOT_PHOTOS_BUCKET, fileId });
    } catch { /* orphan bytes are harmless; the row no longer references them */ }
    await store.appendAudit({
      entity: "lot",
      entityId: id,
      action: "lot.photo_removed",
      actor,
      detail: JSON.stringify({ fileId }),
      createdAt: new Date().toISOString(),
    });
    return NextResponse.json({ ok: true, lot: updated });
  } catch (error) {
    if (error instanceof LotTransitionError) {
      return NextResponse.json({ ok: false, error: error.code, detail: error.detail ?? null }, { status: 400 });
    }
    console.error("[staff/lots/photos] delete failed:", error);
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
