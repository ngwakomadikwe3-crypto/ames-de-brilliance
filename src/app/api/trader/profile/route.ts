import { NextResponse } from "next/server";
import { ensureReady, getDb as getDbSvc, getStorage, getMediaUrl, doc, DB_ID, LICENCE_DOCS_BUCKET } from "@/lib/appwrite";
import { InputFile } from "node-appwrite/file";
import { ID } from "node-appwrite";

export async function POST(req: Request) {
  await ensureReady();
  try {
    const formData = await req.formData();
    const traderId = formData.get("traderId") as string;
    const name = formData.get("name") as string;
    const company = formData.get("company") as string;
    const city = formData.get("city") as string;
    const intro = formData.get("intro") as string;
    const phone = formData.get("phone") as string;

    const data: Record<string, any> = {};
    if (name) data.name = name;
    if (company) data.company = company;
    if (city) data.city = city;
    if (intro) data.intro = intro;
    if (phone) data.whatsapp = phone;

    // Upload logo if provided
    const logo = formData.get("logo") as File | null;
    if (logo && logo.size > 0) {
      const storage = getStorage();
      const fileName = `trader-logo-${traderId}-${Date.now()}.${logo.name.split('.').pop()}`;
      const buffer = Buffer.from(await logo.arrayBuffer());
      const file = InputFile.fromBuffer(buffer, fileName);
      const res = await storage.createFile({
        bucketId: LICENCE_DOCS_BUCKET,
        fileId: ID.unique(),
        file,
      });
      data.logo = getMediaUrl(res.$id);
    }

    if (Object.keys(data).length > 0) {
      await getDbSvc().updateDocument({
        databaseId: DB_ID,
        collectionId: "traders",
        documentId: traderId,
        data,
      });
    }

    const updated = await getDbSvc().getDocument({
      databaseId: DB_ID,
      collectionId: "traders",
      documentId: traderId,
    });

    return NextResponse.json(doc(updated));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
