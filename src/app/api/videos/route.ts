import { NextRequest, NextResponse } from "next/server";
import {
  getAllVideos,
  getPublishedVideos,
  addVideo,
  addModelVideo,
  updateVideo,
  deleteVideo,
  approveModelVideo,
  declineModelVideo,
} from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const published = req.nextUrl.searchParams.get("published");
    if (published === "1") {
      return NextResponse.json(await getPublishedVideos());
    }
    const pending = req.nextUrl.searchParams.get("pending");
    if (pending === "1") {
      const all = await getAllVideos();
      return NextResponse.json(all.filter((v: any) => v.status === "Pending"));
    }
    return NextResponse.json(await getAllVideos());
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { video_url, caption, stone_id, model_id } = await req.json();
    if (!video_url) {
      return NextResponse.json({ error: "video_url required" }, { status: 400 });
    }
    // Model videos go through a separate path with Pending status
    if (model_id) {
      const video = await addModelVideo(String(model_id), video_url, caption || "", stone_id || null);
      return NextResponse.json(video);
    }
    const video = await addVideo(video_url, caption || "", stone_id || null);
    return NextResponse.json(video);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { id, action, ...updates } = await req.json();
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    // Approve/decline model videos
    if (action === "approve") {
      const { house_note, featured_piece, ...rest } = updates;
      const video = await approveModelVideo(String(id), { house_note, featured_piece });
      if (!video) return NextResponse.json({ error: "Video not found" }, { status: 404 });
      return NextResponse.json(video);
    }
    if (action === "decline") {
      const ok = await declineModelVideo(String(id));
      if (!ok) return NextResponse.json({ error: "Video not found" }, { status: 404 });
      return NextResponse.json({ ok: true });
    }
    const video = await updateVideo(String(id), updates);
    if (!video) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }
    return NextResponse.json(video);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const ok = await deleteVideo(id);
    if (!ok) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
