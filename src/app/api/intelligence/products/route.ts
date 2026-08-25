import { NextResponse } from "next/server";
import { ensureReady, getDb, doc } from "@/lib/appwrite";

export async function GET() {
  try {
    await ensureReady();
    const db = getDb();
    const res = await db.listDocuments({
      databaseId: "ames",
      collectionId: "report_products",
    });
    return NextResponse.json(res.documents.map((d: any) => doc(d)));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
