import { NextRequest, NextResponse } from "next/server";
import { ensureReady, getDb, doc, nowISO, DB_ID } from "@/lib/appwrite";
import { ID, Query } from "node-appwrite";
import {chatAccess} from '@/lib/chat-access';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureReady();
  const { id } = await params;
  const access=await chatAccess(_req,id);if(access.response)return access.response;
  const db = getDb();
  const res = await db.listDocuments({
    databaseId: DB_ID,
    collectionId: "chat_messages",
    queries: [
      Query.equal("chat_id", id),
      Query.orderAsc("created_at"),
      Query.limit(500),
    ],
  });
  return NextResponse.json(res.documents.map(d => doc(d)),{headers:{'Cache-Control':'no-store'}});
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureReady();
  const { id } = await params;
  const access=await chatAccess(req,id);if(access.response)return access.response;
  const body = await req.json();
  if(!['user','assistant'].includes(body.role)||typeof body.text!=='string'||!body.text.trim()||body.text.length>20000||body.thinking!==undefined&&(typeof body.thinking!=='string'||body.thinking.length>20000))return NextResponse.json({error:'Invalid message'},{status:400});
  const db = getDb();
  const now = nowISO();

  const msg = await db.createDocument({
    databaseId: DB_ID,
    collectionId: "chat_messages",
    documentId: ID.unique(),
    permissions:[],
    data: {
      chat_id: id,
      role: body.role,
      text: body.text,
      thinking: body.thinking || "",
      created_at: now,
    },
  });

  // Update chat's updated_at and title if first user message
  if (body.role === "user") {
    const updateData: Record<string, string> = { updated_at: now };
    // Auto-title from first user message
    const existing = await db.listDocuments({
      databaseId: DB_ID,
      collectionId: "chat_messages",
      queries: [Query.equal("chat_id", id), Query.limit(2)],
    });
    const userMsgs = existing.documents.filter(
      (d: any) => d.role === "user"
    );
    if (userMsgs.length <= 1) {
      const title = body.text.slice(0, 80) + (body.text.length > 80 ? "…" : "");
      updateData.title = title;
    }
    await db.updateDocument({
      databaseId: DB_ID,
      collectionId: "chats",
      documentId: id,
      data: updateData,
    });
  }

  return NextResponse.json(doc(msg));
}
