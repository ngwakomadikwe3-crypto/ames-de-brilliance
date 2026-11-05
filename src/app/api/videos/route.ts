import { NextRequest, NextResponse } from "next/server";
import { jewelryOwnerGuard } from "@/lib/jewelry-auth";
import { checkChatOrigin } from "@/lib/chat-security";
import { mediaFeed } from "@/lib/customer-media";
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
      const feed = await mediaFeed();
      if (feed.warning) return NextResponse.json({ error: feed.warning }, { status: 503 });
      return NextResponse.json(feed.records.filter(r => r.key.startsWith('video:')).map(r => ({ id: r.id, caption: r.name, video_url: r.mediaUrl, published: true, status: 'Live', featured_piece: r.product.assetId })), { headers: { 'Cache-Control': 'no-store' } });
    }
    const denied = jewelryOwnerGuard(req); if (denied) return denied;
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
  const denied = jewelryOwnerGuard(req); if (denied) return denied;
  try {
    checkChatOrigin(req);
    const { video_url, caption, stone_id, model_id, featured_piece } = await req.json();
    if (!video_url) {
      return NextResponse.json({ error: "video_url required" }, { status: 400 });
    }
    if (featured_piece && (typeof featured_piece !== 'string' || !/^listing-[a-f0-9-]{36}$/.test(featured_piece))) return NextResponse.json({ error: 'Choose a reviewed listing' }, { status: 400 });
    // Model videos go through a separate path with Pending status
    if (model_id) {
      const video = await addModelVideo(String(model_id), video_url, caption || "", stone_id || null);
      return NextResponse.json(video);
    }
    const video = await addVideo(video_url, caption || "", stone_id || null);
    return NextResponse.json(featured_piece ? await updateVideo(String(video.id), { featured_piece }) : video);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const denied = jewelryOwnerGuard(req); if (denied) return denied;
  try {
    checkChatOrigin(req);
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
  const denied = jewelryOwnerGuard(req); if (denied) return denied;
  try {
    checkChatOrigin(req);
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
