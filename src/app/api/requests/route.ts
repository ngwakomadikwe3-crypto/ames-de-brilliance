import { NextRequest, NextResponse } from "next/server";
import { getAllRequests, updateRequest, updateRequestOffer } from "@/lib/db";

export async function GET() {
  return NextResponse.json(getAllRequests());
}

export async function PATCH(request: NextRequest) {
  try {
    const { id, status, offerText } = await request.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    let updated;
    if (offerText !== undefined) {
      updated = updateRequestOffer(id, offerText);
    } else {
      updated = updateRequest(id, { status });
    }
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(updated);
  } catch { return NextResponse.json({ error: "Failed" }, { status: 500 }); }
}
