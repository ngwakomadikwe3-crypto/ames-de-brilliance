import { NextRequest, NextResponse } from "next/server";
import { ensureReady, getDb, doc, nowISO, DB_ID } from "@/lib/appwrite";
import { ID, Query } from "node-appwrite";

export async function GET() {
  await ensureReady();
  const db = getDb();
  const res = await db.listDocuments({
    databaseId: DB_ID,
    collectionId: "chats",
    queries: [Query.orderDesc("updated_at"), Query.limit(100)],
  });
  return NextResponse.json(res.documents.map(d => doc(d)));
}

export async function POST(req: NextRequest) {
  await ensureReady();
  const db = getDb();
  const now = nowISO();
  const doc_ = await db.createDocument({
    databaseId: DB_ID,
    collectionId: "chats",
    documentId: ID.unique(),
    data: { title: "New chat", created_at: now, updated_at: now },
  });
  return NextResponse.json(doc(doc_));
}
