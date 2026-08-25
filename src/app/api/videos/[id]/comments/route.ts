import { NextRequest, NextResponse } from "next/server";
import { ensureReady, getDb as getDbSvc, doc, nowISO, DB_ID } from "@/lib/appwrite";
import { ID, Query } from "node-appwrite";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureReady();
    const { id } = await params;
    const res = await getDbSvc().listDocuments({ databaseId: DB_ID, collectionId: "comments", queries: [Query.equal("video_id", id), Query.orderAsc("created_at")] });
    return NextResponse.json(res.documents.map(d => doc(d)));
  } catch (err: any) { return NextResponse.json({ error: err.message }, { status: 500 }); }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureReady();
    const { id } = await params;
    const { author, text } = await request.json();
    if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });
    const res = await getDbSvc().createDocument({ databaseId: DB_ID, collectionId: "comments", documentId: ID.unique(), data: { video_id: id, author: author || "Anonymous", text, created_at: nowISO() } });
    return NextResponse.json(doc(res));
  } catch (err: any) { return NextResponse.json({ error: err.message }, { status: 500 }); }
}
