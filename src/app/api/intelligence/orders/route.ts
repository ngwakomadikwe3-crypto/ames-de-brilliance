import { NextRequest, NextResponse } from "next/server";
import { ensureReady, getDb, doc, nowISO } from "@/lib/appwrite";
import { ID, Query } from "node-appwrite";

export async function GET() {
  try {
    await ensureReady();
    const db = getDb();
    const res = await db.listDocuments({
      databaseId: "ames",
      collectionId: "report_orders",
      queries: [Query.orderDesc("created_at"), Query.limit(200)],
    });
    return NextResponse.json(res.documents.map((d: any) => doc(d)));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureReady();
    const db = getDb();
    const body = await req.json();

    const order = await db.createDocument({
      databaseId: "ames",
      collectionId: "report_orders",
      documentId: ID.unique(),
      data: {
        product_slug: body.product_slug || "",
        product_name: body.product_name || "",
        tier: body.tier || "",
        tier_label: body.tier_label || "",
        charge: body.charge || 0,
        buyer_name: body.buyer_name || "",
        buyer_email: body.buyer_email || "",
        buyer_whatsapp: body.buyer_whatsapp || "",
        company: body.company || "",
        notes: body.notes || "",
        status: "Requested",
        created_at: nowISO(),
      },
    });

    return NextResponse.json(doc(order));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await ensureReady();
    const db = getDb();
    const body = await req.json();
    const { id, ...data } = body;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const updated = await db.updateDocument({
      databaseId: "ames",
      collectionId: "report_orders",
      documentId: id,
      data,
    });
    return NextResponse.json(doc(updated));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
