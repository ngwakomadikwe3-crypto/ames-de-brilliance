import { NextRequest, NextResponse } from "next/server";
import { ensureUploadsDir } from "@/lib/db";
import path from "path";
import fs from "fs";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const allowedTypes = ["video/mp4", "video/webm", "video/quicktime"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Only MP4, WebM, and MOV files are allowed" },
        { status: 400 }
      );
    }

    // Max 100MB
    if (file.size > 100 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File too large (max 100MB)" },
        { status: 400 }
      );
    }

    const dir = ensureUploadsDir();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const finalName = `video_${Date.now()}_${safeName}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(path.join(dir, finalName), buffer);

    return NextResponse.json({
      url: `/api/stones/photo/${finalName}`,
      filename: finalName,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
