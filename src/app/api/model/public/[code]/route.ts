import { NextResponse } from "next/server";
import { ensureReady, getDb as getDbSvc, doc, DB_ID } from "@/lib/appwrite";
import { rewriteStoredUrl } from "@/lib/storage-urls";
import { Query } from "node-appwrite";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  await ensureReady();
  try {
    const db = await getDbSvc();
    const modelRes = await db.listDocuments({
      databaseId: DB_ID,
      collectionId: "models",
      queries: [Query.equal("portal_code", code), Query.limit(1)],
    });
    if (modelRes.documents.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const m = modelRes.documents[0] as any;
    const safeModel = {
      name: m.name,
      instagram: m.instagram,
      bio: m.bio,
      photo: rewriteStoredUrl(m.profile_photo || ""),
    };

    const videoRes = await db.listDocuments({
      databaseId: DB_ID,
      collectionId: "videos",
      queries: [
        Query.equal("model_id", m.$id),
        Query.equal("status", "Live"),
      ],
    });

    return NextResponse.json({
      model: safeModel,
      videos: videoRes.documents.map((v) => ({
        ...doc(v) as Record<string, unknown>,
        video_url: rewriteStoredUrl(String((v as { video_url?: string }).video_url || "")),
      })),
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
