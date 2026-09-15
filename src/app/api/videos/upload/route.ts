import {videoService} from '@/lib/videos';
import { NextRequest, NextResponse } from "next/server";
import { getStorage, MEDIA_BUCKET } from "@/lib/appwrite";
import { ID } from "node-appwrite";
import { InputFile } from "node-appwrite/file";
import {publicUploadName} from '@/lib/public-upload.mjs';

export async function POST(req: NextRequest) {
  try {
    await videoService.admin(req);
    if(Number(req.headers.get('content-length'))>4*1024*1024+65536)return NextResponse.json({error:'Upload too large'},{status:413});
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!(file instanceof File) || !file.size) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const kind=formData.get("kind")==="image"?"image":"video";
    const allowedTypes = kind==="image"?["image/jpeg","image/png","image/webp"]:["video/mp4", "video/webm", "video/quicktime"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Only MP4, WebM, and MOV files are allowed" },
        { status: 400 }
      );
    }

    const bucket=await getStorage().getBucket({bucketId:MEDIA_BUCKET});
    if(!bucket.enabled||!bucket.fileSecurity||bucket.$permissions.length)throw Object.assign(new Error('Media bucket must be private'),{status:503});
    if (file.size > Math.min(bucket.maximumFileSize,4*1024*1024)) {
      return NextResponse.json(
        { error: `File too large (max ${Math.floor(Math.min(bucket.maximumFileSize,4*1024*1024)/1024/1024)} MB)` },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const safeName = publicUploadName(file.name,buffer,kind);
    const inputFile = InputFile.fromBuffer(buffer, `ames-admin-${kind}-${Date.now()}-${safeName}`);
    const res = await getStorage().createFile({ bucketId: MEDIA_BUCKET, fileId: ID.unique(), file: inputFile,permissions:[] });

    return NextResponse.json({
      url: `/api/videos/files/${res.$id}`,
      filename: res.$id,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.status ? err.message : "Upload unavailable" }, { status: err.status || 503 });
  }
}
