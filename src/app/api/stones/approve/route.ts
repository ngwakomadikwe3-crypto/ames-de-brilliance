import { NextRequest, NextResponse } from "next/server";
import { approveStone, rejectStone, getStoneById } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const { id, edits, action, reason } = await request.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const stone = await getStoneById(id);
    if (!stone) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (action === "approve") {
      const updated = await approveStone(id, edits || {});
      return NextResponse.json(updated);
    } else if (action === "reject") {
      const updated = await rejectStone(id, reason || "");
      return NextResponse.json(updated);
    }

    return NextResponse.json({ error: "action must be approve or reject" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
