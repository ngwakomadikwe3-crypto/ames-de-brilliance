import { NextRequest, NextResponse } from "next/server";
import { ensureReady, getDb, doc, nowISO, DB_ID } from "@/lib/appwrite";
import { ID, Query } from "node-appwrite";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureReady();
  const { id } = await params;
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
  return NextResponse.json(res.documents.map(d => doc(d)));
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureReady();
  const { id } = await params;
  const body = await req.json();
  const db = getDb();
  const now = nowISO();

  const msg = await db.createDocument({
    databaseId: DB_ID,
    collectionId: "chat_messages",
    documentId: ID.unique(),
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
