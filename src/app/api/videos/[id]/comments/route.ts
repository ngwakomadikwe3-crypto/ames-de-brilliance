import { NextRequest, NextResponse } from "next/server";
import { ensureReady, getDb as getDbSvc, doc, nowISO, DB_ID } from "@/lib/appwrite";
import { ID, Query } from "node-appwrite";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureReady();
    const { id } = await params;
    const video=await getDbSvc().getDocument({databaseId:DB_ID,collectionId:'videos',documentId:id});if(!video.published||video.status!=='Live')return NextResponse.json({error:'Video unavailable'},{status:404});
    const res = await getDbSvc().listDocuments({ databaseId: DB_ID, collectionId: "comments", queries: [Query.equal("video_id", id), Query.orderAsc("created_at")] });
    return NextResponse.json(res.documents.map(d => ({id:d.$id,author:d.author,text:d.text,created_at:d.created_at})));
  } catch (err: any) { return NextResponse.json({ error: err.message }, { status: 500 }); }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureReady();
    const { id } = await params;
    const video=await getDbSvc().getDocument({databaseId:DB_ID,collectionId:'videos',documentId:id});if(!video.published||video.status!=='Live')return NextResponse.json({error:'Video unavailable'},{status:404});
    const { author, whatsapp, text } = await request.json();
    if(typeof text!=='string'||text.length>2000||typeof author!=='string'||author.length>100||whatsapp!==undefined&&(typeof whatsapp!=='string'||whatsapp.length>40))return NextResponse.json({error:'Invalid comment'},{status:400});
    if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });
    if (!author || !author.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    const res = await getDbSvc().createDocument({ databaseId: DB_ID, collectionId: "comments", documentId: ID.unique(), data: { video_id: id, author: author.trim(), whatsapp: whatsapp || "", text, created_at: nowISO() } });
    return NextResponse.json(doc(res));
  } catch (err: any) { return NextResponse.json({ error: err.message }, { status: 500 }); }
}
