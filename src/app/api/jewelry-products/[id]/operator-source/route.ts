import { NextRequest, NextResponse } from "next/server";
import { jewelryOwnerGuard } from "@/lib/jewelry-auth";
import { getJewelryProduct, registerOperatorSource } from "@/lib/jewelry-products";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = jewelryOwnerGuard(request);
  if (denied) return denied;
  const product = await getJewelryProduct((await params).id);
  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const body = await request.json();
    const filename = String(body.filename || "").trim();
    const bytes = Number(body.bytes);
    const sha256 = String(body.sha256 || "").trim();
    if (!filename || !Number.isSafeInteger(bytes)) throw new Error("Filename and byte count are required");
    return NextResponse.json(await registerOperatorSource(product, { filename, bytes, sha256 }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Operator source registration failed" }, { status: 400 });
  }
}
