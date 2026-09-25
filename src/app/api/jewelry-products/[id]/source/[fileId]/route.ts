import { NextRequest, NextResponse } from "next/server";
import { jewelryOwnerGuard } from "@/lib/jewelry-auth";
import { getJewelryProduct } from "@/lib/jewelry-products";
import { getStorage, JEWELRY_SOURCES_BUCKET } from "@/lib/appwrite";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  const denied = jewelryOwnerGuard(request);
  if (denied) return denied;
  const { id, fileId } = await params;
  const product = await getJewelryProduct(id);
  const entry = product?.source_files.find(file => file.fileId === fileId);
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const bytes = await getStorage().getFileDownload({ bucketId: JEWELRY_SOURCES_BUCKET, fileId });
    const filename = entry.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    return new NextResponse(bytes, { headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch { return NextResponse.json({ error: "Source download unavailable" }, { status: 503 }); }
}
