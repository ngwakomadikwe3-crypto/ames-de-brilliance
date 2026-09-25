import { NextRequest, NextResponse } from "next/server";
import { jewelryOwnerGuard } from "@/lib/jewelry-auth";
import { addJewelryFile, getJewelryProduct } from "@/lib/jewelry-products";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = jewelryOwnerGuard(request);
  if (denied) return denied;
  let product = await getJewelryProduct((await params).id);
  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const body = await request.formData();
    const files = body.getAll("files").filter((item): item is File => item instanceof File);
    if (!files.length || files.length > 10) throw new Error("Choose between 1 and 10 files");
    if (files.reduce((total, file) => total + file.size, 0) > 250 * 1024 * 1024) {
      throw new Error("Combined upload exceeds 250 MB");
    }
    for (const file of files) product = await addJewelryFile(product, file);
    return NextResponse.json(product);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Upload failed" }, { status: 400 });
  }
}
