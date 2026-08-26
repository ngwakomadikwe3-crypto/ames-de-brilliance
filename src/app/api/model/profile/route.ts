import { NextRequest, NextResponse } from "next/server";
import { ensureReady, getDb as getDbSvc, getStorage, getMediaUrl, doc, DB_ID, MEDIA_BUCKET } from "@/lib/appwrite";
import { InputFile } from "node-appwrite";

export async function PUT(request: NextRequest) {
  try {
    await ensureReady();
    const formData = await request.formData();
    const modelId = formData.get("id") as string;
    if (!modelId) return NextResponse.json({ error: "id required" }, { status: 400 });

    const update: Record<string, string> = {};
    const name = formData.get("name") as string;
    const displayName = formData.get("display_name") as string;
    const bio = formData.get("bio") as string;
    const instagram = formData.get("instagram") as string;

    if (name) update.name = name;
    if (displayName !== null) update.display_name = displayName;
    if (bio !== null) update.bio = bio;
    if (instagram !== null) update.instagram = instagram;

    // Handle profile photo upload
    const photoFile = formData.get("photo") as File | null;
    if (photoFile && photoFile.size > 0) {
      const sto = getStorage();
      const ext = photoFile.name.split(".").pop() || "jpg";
      const fileId = `model_${modelId}_${Date.now()}.${ext}`;
      try {
        await sto.createFile({
          bucketId: MEDIA_BUCKET,
          fileId,
          file: InputFile.fromBuffer(photoFile, photoFile.name),
        });
        update.profile_photo = getMediaUrl(MEDIA_BUCKET, fileId);
      } catch {}
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const db = await getDbSvc();
    const result = await db.updateDocument({
      databaseId: DB_ID,
      collectionId: "models",
      documentId: modelId,
      data: update,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
