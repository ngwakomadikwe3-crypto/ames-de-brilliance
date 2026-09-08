import { NextRequest, NextResponse } from "next/server";
import { ensureReady, getDb, doc, DB_ID } from "@/lib/appwrite";
import {chatAccess} from '@/lib/chat-access';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureReady();
  const { id } = await params;
  const access=await chatAccess(req,id);if(access.response)return access.response;
  const body = await req.json();
  if(typeof body.title!=='string'||!body.title.trim()||body.title.length>100)return NextResponse.json({error:'Valid title required'},{status:400});
  const db = getDb();
  const updated = await db.updateDocument({
    databaseId: DB_ID,
    collectionId: "chats",
    documentId: id,
    data: {title:body.title},
  });
  return NextResponse.json(doc(updated));
}
