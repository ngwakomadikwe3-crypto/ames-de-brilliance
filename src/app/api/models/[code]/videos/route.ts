import { NextRequest, NextResponse } from "next/server";
import { getModelByPortalCode, getModelVideos, addModelVideo } from "@/lib/db";

async function getModel(code: string) {
  const model = await getModelByPortalCode(code);
  if (!model || model.status !== "Active") return null;
  return model;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;
    const model = await getModel(code);
    if (!model) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(await getModelVideos(model.id));
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;
    const model = await getModel(code);
    if (!model) return NextResponse.json({ error: "not found" }, { status: 404 });
    const { video_url, caption, stone_id } = await req.json();
    if (!video_url) {
      return NextResponse.json({ error: "video_url required" }, { status: 400 });
    }
    const video = await addModelVideo(model.id, video_url, caption || "", stone_id || null);
    return NextResponse.json(video);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
