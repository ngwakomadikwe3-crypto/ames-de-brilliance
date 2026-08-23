import { NextRequest, NextResponse } from "next/server";
import { addStone, updateStone, getAllStones, getOrCreateTrader, savePhoto } from "@/lib/db";

export async function GET() {
  return NextResponse.json(getAllStones());
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";
    let data: Record<string, string>;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      data = {};
      for (const [k, v] of formData.entries()) {
        if (typeof v === "string") data[k] = v;
      }
      const file = formData.get("photoFile") as File | null;
      if (file && file.size > 0) {
        const buffer = Buffer.from(await file.arrayBuffer());
        const photoUrl = savePhoto(file.name, buffer);
        data.photo = photoUrl;
      }
    } else {
      data = await request.json();
    }

    const source = (data.source || "Own stock") as "Own stock" | "Consigned";
    let traderId: number | null = null;

    if (source === "Consigned" && data.traderName) {
      traderId = getOrCreateTrader(data.traderName, data.traderWhatsapp || "", data.traderLicence || "");
    }

    const saved = addStone({
      stone_type: data.stone_type || "polished",
      shape: data.shape || "Round Brilliant",
      carat: parseFloat(data.carat) || 0,
      color: data.color || "D",
      clarity: data.clarity || "",
      cut: data.cut || "",
      certification: data.certification || "",
      category: data.category || "",
      crystal_form: data.crystal_form || "",
      clarity_notes: data.clarity_notes || "",
      kp_status: data.kp_status === "true" || data.kp_status === "1",
      price: data.price ? Number(data.price) : null,
      status: data.status || "Available",
      photo: data.photo || "",
      source,
      trader_id: traderId,
      commission: parseFloat(data.commission) || 0,
      photo_path: null,
    });
    return NextResponse.json({ id: saved.id, ref: saved.ref });
  } catch { return NextResponse.json({ error: "Failed" }, { status: 500 }); }
}

export async function PATCH(request: NextRequest) {
  try {
    const { id, status, salePrice } = await request.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const updated = updateStone(id, { status, sale_price: salePrice });
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(updated);
  } catch { return NextResponse.json({ error: "Failed" }, { status: 500 }); }
}
