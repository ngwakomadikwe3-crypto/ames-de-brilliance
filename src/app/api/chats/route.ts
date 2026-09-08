import { NextRequest, NextResponse } from "next/server";
import { ensureReady, getDb, doc, nowISO, DB_ID } from "@/lib/appwrite";
import { ID, Query } from "node-appwrite";
import {chatAccess} from '@/lib/chat-access';

export async function GET(req:NextRequest) {
  const access=await chatAccess(req);if(access.response)return access.response;
  await ensureReady();
  const db = getDb();
  if (!db) return NextResponse.json({ error: 'Chat storage is unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  const res = await db.listDocuments({
    databaseId: DB_ID,
    collectionId: "chats",
    queries: [...(access.admin?[]:[Query.equal('userId',access.user!.id)]),Query.orderDesc("updated_at"), Query.limit(100)],
  });
  return NextResponse.json(res.documents.map(d => doc(d)),{headers:{'Cache-Control':'no-store'}});
}

export async function POST(req: NextRequest) {
  const access=await chatAccess(req);if(access.response)return access.response;
  if(!access.user)return NextResponse.json({error:'Customer sign in required'},{status:401});
  await ensureReady();
  const db = getDb();
  if (!db) return NextResponse.json({ error: 'Chat storage is unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  const now = nowISO();
  const doc_ = await db.createDocument({
    databaseId: DB_ID,
    collectionId: "chats",
    documentId: ID.unique(),
    data: { userId:access.user.id,title: "New chat", created_at: now, updated_at: now },permissions:[],
  });
  return NextResponse.json(doc(doc_));
}
