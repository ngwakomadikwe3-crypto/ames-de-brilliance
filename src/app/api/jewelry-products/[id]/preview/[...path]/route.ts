import { NextRequest, NextResponse } from "next/server";
import { jewelryOwnerGuard } from "@/lib/jewelry-auth";
import { getJewelryProduct } from "@/lib/jewelry-products";
import { getPackEvidence, readPackFile } from "@/lib/jewelry-pack";
import { previewablePackPath } from "@/lib/jewelry-workflow";

const contentTypes: Record<string, string> = {
  glb: "model/gltf-binary", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
  webp: "image/webp", mp4: "video/mp4", json: "application/json",
};

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; path: string[] }> }) {
  const denied = jewelryOwnerGuard(request);
  if (denied) return denied;
  const { id, path: segments } = await params;
  const product = await getJewelryProduct(id);
  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const path = segments.join("/");
  try {
    const pack = await getPackEvidence(product.asset_id);
    if (!pack.files.includes(path) || !previewablePackPath(path)) throw new Error("Preview not found");
    const data = await readPackFile(product.asset_id, path);
    const ext = path.split(".").pop()?.toLowerCase() || "";
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": contentTypes[ext] || "application/octet-stream",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch { return NextResponse.json({ error: "Preview not found" }, { status: 404 }); }
}
