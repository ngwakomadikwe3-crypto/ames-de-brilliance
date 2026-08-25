import { NextRequest, NextResponse } from "next/server";
import { ensureReady, getDb as getDbSvc, doc, DB_ID } from "@/lib/appwrite";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureReady();
    const { id } = await params;
    const { delta } = await _req.json();
    if (delta !== 1 && delta !== -1) return NextResponse.json({ error: "delta must be 1 or -1" }, { status: 400 });
    const v = await getDbSvc().getDocument({ databaseId: DB_ID, collectionId: "videos", documentId: id });
    const newCount = Math.max(0, (v.likes_count || 0) + delta);
    await getDbSvc().updateDocument({ databaseId: DB_ID, collectionId: "videos", documentId: id, data: { likes_count: newCount } });
    return NextResponse.json({ likes_count: newCount });
  } catch (err: any) { return NextResponse.json({ error: err.message }, { status: 500 }); }
}
