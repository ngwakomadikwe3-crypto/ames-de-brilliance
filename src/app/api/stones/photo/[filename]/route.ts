import { NextRequest, NextResponse } from "next/server";
import { getPhotoFile } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;
  const buffer = getPhotoFile(filename);
  if (!buffer) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const ext = filename.split(".").pop()?.toLowerCase() || "jpg";
  const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  return new NextResponse(new Uint8Array(buffer), { headers: { "Content-Type": mime, "Cache-Control": "public, max-age=86400" } });
}