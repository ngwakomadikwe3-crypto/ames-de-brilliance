import { NextRequest, NextResponse } from "next/server";
import { jewelryOwnerGuard } from "@/lib/jewelry-auth";
import { getJewelryProduct, updateJewelryProduct } from "@/lib/jewelry-products";
import { getPackEvidence, syncEngineContent } from "@/lib/jewelry-pack";
import { transitionJewelry, type JewelryAction } from "@/lib/jewelry-workflow";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Context) {
  const denied = jewelryOwnerGuard(request);
  if (denied) return denied;
  const product = await getJewelryProduct((await params).id);
  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let pack = null;
  let packError = null;
  try { pack = await getPackEvidence(product.asset_id); }
  catch (error) { packError = error instanceof Error ? error.message : "Engine pack unavailable"; }
  return NextResponse.json({ product, pack, packError });
}

export async function PATCH(request: NextRequest, { params }: Context) {
  const denied = jewelryOwnerGuard(request);
  if (denied) return denied;
  const product = await getJewelryProduct((await params).id);
  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const body = await request.json();
    const action = String(body.action || "") as JewelryAction;
    const pack = ["attach_pack", "technical_pass", "approve", "publish"].includes(action)
      ? await getPackEvidence(product.asset_id) : undefined;
    const updates = transitionJewelry(product, action, pack, String(body.reason || ""));
    if (action === "publish") {
      // The existing generic sync performs cross-contract validation and copies
      // the approved pack to the established namespaced app-content paths.
      await syncEngineContent();
    }
    const changedAt = new Date().toISOString();
    return NextResponse.json(await updateJewelryProduct(product.id, {
      ...updates,
      status_history: [...product.status_history, {
        status: updates.workflow_status || product.workflow_status,
        action, reason: String(body.reason || "").trim(), at: changedAt,
      }],
    }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Jewelry action failed" }, { status: 400 });
  }
}
