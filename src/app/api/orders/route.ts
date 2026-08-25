import { NextRequest, NextResponse } from "next/server";
import { createOrder, getStoneById, getAllOrders, updateOrderStatus } from "@/lib/db";

export async function GET() {
  return NextResponse.json(await getAllOrders());
}

export async function POST(request: NextRequest) {
  try {
    const { stoneId, buyerName, buyerWhatsapp, price } = await request.json();
    if (!stoneId) return NextResponse.json({ error: "stoneId required" }, { status: 400 });

    const stone = await getStoneById(stoneId);
    if (!stone) return NextResponse.json({ error: "Stone not found" }, { status: 404 });
    if (stone.status !== "Available") return NextResponse.json({ error: "Stone is not available" }, { status: 409 });

    const order = await createOrder(stoneId, stone.ref, buyerName || "", buyerWhatsapp || "", price ?? stone.price);
    return NextResponse.json({ order, message: "Reserved" });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
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
