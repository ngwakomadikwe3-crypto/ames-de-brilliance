import { NextResponse } from "next/server";
import { ensureReady, getDb as getDbSvc, doc, DB_ID } from "@/lib/appwrite";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  await ensureReady();
  try {
    const db = await getDbSvc();
    const traderRes = await db.listDocuments(DB_ID, "traders", [
      doc("equal", "portal_code", code),
    ]);
    if (traderRes.documents.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const t = traderRes.documents[0] as any;
    // Only return safe public fields
    const safeTrader = {
      name: t.name,
      company: t.company,
      country: t.country,
      preferred: t.preferred || false,
    };

    // Get stones with Available status
    const stoneRes = await db.listDocuments(DB_ID, "stones", [
      doc("equal", "trader_id", t.$id),
      doc("equal", "status", "Available"),
    ]);

    return NextResponse.json({
      trader: safeTrader,
      stones: stoneRes.documents,
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
