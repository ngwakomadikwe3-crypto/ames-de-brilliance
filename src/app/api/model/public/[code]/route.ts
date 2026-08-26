import { NextResponse } from "next/server";
import { ensureReady, getDb as getDbSvc, doc, DB_ID } from "@/lib/appwrite";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  await ensureReady();
  try {
    const db = await getDbSvc();
    const modelRes = await db.listDocuments(DB_ID, "models", [
      doc("equal", "portal_code", code),
    ]);
    if (modelRes.documents.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const m = modelRes.documents[0] as any;
    if (m.status !== "Active") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const safeModel = {
      name: m.name,
      instagram: m.instagram || "",
    };

    // Get live videos
    const videoRes = await db.listDocuments(DB_ID, "videos", [
      doc("equal", "model_id", m.$id),
      doc("equal", "status", "Live"),
    ]);

    return NextResponse.json({
      model: safeModel,
      videos: videoRes.documents,
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
