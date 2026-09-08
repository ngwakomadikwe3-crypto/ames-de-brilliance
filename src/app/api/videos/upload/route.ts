import { NextRequest, NextResponse } from "next/server";
import { getStorage, getMediaUrl, DB_ID, MEDIA_BUCKET } from "@/lib/appwrite";
import { ID,Permission,Role } from "node-appwrite";
import { InputFile } from "node-appwrite/file";
import {publicUploadName} from '@/lib/public-upload.mjs';

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

    const bucket=await getStorage().getBucket({bucketId:MEDIA_BUCKET});
    if (file.size > bucket.maximumFileSize) {
      return NextResponse.json(
        { error: `File too large (max ${Math.floor(bucket.maximumFileSize/1024/1024)} MB)` },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const safeName = publicUploadName(file.name,buffer,'video');
    const inputFile = InputFile.fromBuffer(buffer, `video_${Date.now()}_${safeName}`);
    const res = await getStorage().createFile({ bucketId: MEDIA_BUCKET, fileId: ID.unique(), file: inputFile,permissions:[Permission.read(Role.any())] });

    return NextResponse.json({
      url: getMediaUrl(res.$id),
      filename: res.$id,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
