import { NextRequest, NextResponse } from "next/server";
import { ensureReady, getDb as getDbSvc, getStorage, getLicenceUrl, doc, DB_ID, LICENCE_DOCS_BUCKET } from "@/lib/appwrite";
import { InputFile } from "node-appwrite";

export async function PUT(request: NextRequest) {
  try {
    await ensureReady();
    const formData = await request.formData();
    const traderId = formData.get("id") as string;
    if (!traderId) return NextResponse.json({ error: "id required" }, { status: 400 });

    const update: Record<string, string> = {};
    const name = formData.get("name") as string;
    const displayName = formData.get("display_name") as string;
    const company = formData.get("company") as string;
    const city = formData.get("city") as string;
    const intro = formData.get("bio_intro") as string;

    if (name) update.name = name;
    if (displayName !== null) update.display_name = displayName;
    if (company !== null) update.company = company;
    if (city !== null) update.city = city;
    if (intro !== null) update.bio_intro = intro;

    // Handle logo photo upload
    const logoFile = formData.get("logo") as File | null;
    if (logoFile && logoFile.size > 0) {
      const sto = getStorage();
      const ext = logoFile.name.split(".").pop() || "jpg";
      const fileId = `logo_${traderId}_${Date.now()}.${ext}`;
      try {
        await sto.createFile({
          bucketId: LICENCE_DOCS_BUCKET,
          fileId,
          file: InputFile.fromBuffer(logoFile, logoFile.name),
        });
        update.logo_photo = getLicenceUrl(LICENCE_DOCS_BUCKET, fileId);
      } catch {}
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const db = await getDbSvc();
    const result = await db.updateDocument({
      databaseId: DB_ID,
      collectionId: "traders",
      documentId: traderId,
      data: update,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
