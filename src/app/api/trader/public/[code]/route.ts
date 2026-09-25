import { NextResponse } from "next/server";
import { ensureReady, getDb as getDbSvc, doc, DB_ID } from "@/lib/appwrite";
import { Query } from "node-appwrite";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  await ensureReady();
  try {
    const db = await getDbSvc();
    const traderRes = await db.listDocuments({
      databaseId: DB_ID,
      collectionId: "traders",
      queries: [Query.equal("portal_code", code), Query.limit(1)],
    });
    if (traderRes.documents.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const t = traderRes.documents[0] as any;
    const safeTrader = {
      name: t.name,
      company: t.company,
      country: t.country,
      preferred: t.preferred || false,
    };

    const stoneRes = await db.listDocuments({
      databaseId: DB_ID,
      collectionId: "stones",
      queries: [
        Query.equal("trader_id", t.$id),
        Query.equal("status", "Available"),
      ],
    });

    return NextResponse.json({
      trader: safeTrader,
      stones: stoneRes.documents,
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
