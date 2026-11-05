import { NextRequest, NextResponse } from "next/server";
import { jewelryOwnerGuard } from "@/lib/jewelry-auth";
import { checkChatOrigin } from "@/lib/chat-security";
import { getAllOrders, updateOrderStatus } from "@/lib/db";

export async function GET(request: NextRequest) {
  const denied = jewelryOwnerGuard(request); if (denied) return denied;
  return NextResponse.json(await getAllOrders());
}

export async function POST(request: NextRequest) {
  return NextResponse.json({ error: "Use your account cart to request an invoice." }, { status: 409 });
}

export async function PATCH(request: NextRequest) {
  const denied = jewelryOwnerGuard(request); if (denied) return denied;
  try {
    checkChatOrigin(request);
    const { id, status } = await request.json();
    if (!id || !status) return NextResponse.json({ error: "id and status required" }, { status: 400 });

    const validStatuses = ["Reserved", "Invoiced", "Paid", "Shipped", "Closed"];
    if (!validStatuses.includes(status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });

    const updated = await updateOrderStatus(String(id), status);
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
