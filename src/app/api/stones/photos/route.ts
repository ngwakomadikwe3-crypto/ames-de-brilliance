import { NextRequest, NextResponse } from "next/server";
import { savePhotos } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files: File[] = [];
    
    for (const [key, value] of formData.entries()) {
      if (key === "photos" && value instanceof File) {
        files.push(value);
      }
    }
    
    if (files.length === 0) {
      return NextResponse.json({ error: "No photos provided" }, { status: 400 });
    }
    
    if (files.length > 6) {
      return NextResponse.json({ error: "Maximum 6 photos allowed" }, { status: 400 });
    }
    
    const urls = await savePhotos(files);
    return NextResponse.json({ urls });
  } catch (err: any) {
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
