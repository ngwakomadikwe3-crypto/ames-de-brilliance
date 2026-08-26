import { NextResponse } from "next/server";
import { ensureReady, getDb as getDbSvc, getStorage, getMediaUrl, doc, DB_ID, MEDIA_BUCKET } from "@/lib/appwrite";
import { InputFile } from "node-appwrite/file";
import { ID } from "node-appwrite";

export async function POST(req: Request) {
  await ensureReady();
  try {
    const formData = await req.formData();
    const modelId = formData.get("modelId") as string;
    const name = formData.get("name") as string;
    const instagram = formData.get("instagram") as string;
    const bio = formData.get("bio") as string;

    const data: Record<string, any> = {};
    if (name) data.name = name;
    if (instagram) data.instagram = instagram;
    if (bio) data.bio = bio;

    // Upload profile photo if provided
    const photo = formData.get("photo") as File | null;
    if (photo && photo.size > 0) {
      const storage = getStorage();
      const fileName = `model-profile-${modelId}-${Date.now()}.${photo.name.split('.').pop()}`;
      const buffer = Buffer.from(await photo.arrayBuffer());
      const file = InputFile.fromBuffer(buffer, fileName);
      const res = await storage.createFile({
        bucketId: MEDIA_BUCKET,
        fileId: ID.unique(),
        file,
      });
      data.profile_photo = getMediaUrl(res.$id);
    }

    if (Object.keys(data).length > 0) {
      await getDbSvc().updateDocument({
        databaseId: DB_ID,
        collectionId: "models",
        documentId: modelId,
        data,
      });
    }

    const updated = await getDbSvc().getDocument({
      databaseId: DB_ID,
      collectionId: "models",
      documentId: modelId,
    });

    return NextResponse.json(doc(updated));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
