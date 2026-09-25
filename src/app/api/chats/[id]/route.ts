import { NextRequest, NextResponse } from "next/server";
import { ensureReady, getDb, doc, DB_ID } from "@/lib/appwrite";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureReady();
  const { id } = await params;
  const body = await req.json();
  const db = getDb();
  const updated = await db.updateDocument({
    databaseId: DB_ID,
    collectionId: "chats",
    documentId: id,
    data: body,
  });
  return NextResponse.json(doc(updated));
}
