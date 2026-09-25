import { NextRequest, NextResponse } from "next/server";
import { jewelryOwnerGuard } from "@/lib/jewelry-auth";
import { getJewelryProduct } from "@/lib/jewelry-products";
import { handoffSourceDescriptor } from "@/lib/jewelry-workflow";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = jewelryOwnerGuard(request);
  if (denied) return denied;
  const product = await getJewelryProduct((await params).id);
  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({
    schemaVersion: "ames.jewelry-handoff/1",
    productId: product.id, traderId: product.trader_id,
    assetId: product.asset_id, name: product.name, category: product.category,
    workflowStatus: product.workflow_status,
    sourceMode: product.source_mode,
    sources: product.source_files.map(file => handoffSourceDescriptor(product.id, file, product.source_mode)),
    engineProcessing: "operator_handoff_required",
  }, { headers: { "Cache-Control": "private, no-store" } });
}
