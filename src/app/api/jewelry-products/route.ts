import { NextRequest, NextResponse } from "next/server";
import { jewelryOwnerGuard } from "@/lib/jewelry-auth";
import { createJewelryProduct, listJewelryProducts } from "@/lib/jewelry-products";

export async function GET(request: NextRequest) {
  const denied = jewelryOwnerGuard(request);
  if (denied) return denied;
  try { return NextResponse.json(await listJewelryProducts()); }
  catch { return NextResponse.json({ error: "Jewelry products are unavailable" }, { status: 503 }); }
}

export async function POST(request: NextRequest) {
  const denied = jewelryOwnerGuard(request);
  if (denied) return denied;
  try {
    const body = await request.json();
    const product = await createJewelryProduct({
      traderId: String(body.traderId || ""), name: String(body.name || ""),
      category: String(body.category || ""), assetId: body.assetId ? String(body.assetId) : undefined,
      sourceMode: body.sourceMode === "operator_handoff" ? "operator_handoff" : "cloud_source_upload",
    });
    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create jewelry product" }, { status: 400 });
  }
}
