import { NextRequest, NextResponse } from "next/server";
import { getTraderByPortalCode, getTraderStones, addStone, getStoneStatusLog, savePhoto } from "@/lib/db";

async function authenticate(code: string) {
  const trader = await getTraderByPortalCode(code);
  if (!trader) return null;
  return trader;
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const trader = await authenticate(code);
  if (!trader) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const stones = await getTraderStones(trader.id);
  // Attach status logs
  const stonesWithLog = await Promise.all(stones.map(async (s: any) => ({
    ...s,
    status_log: await getStoneStatusLog(s.id),
  })));
  return NextResponse.json(stonesWithLog);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const trader = await authenticate(code);
  if (!trader) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!trader.licence) return NextResponse.json({ error: "Complete onboarding first" }, { status: 403 });

  try {
    const contentType = request.headers.get("content-type") || "";
    let data: Record<string, string>;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      data = {};
      for (const [k, v] of formData.entries()) {
        if (typeof v === "string") data[k] = v;
      }
      const file = formData.get("photo") as File | null;
      if (file && file.size > 0) {
        const buffer = Buffer.from(await file.arrayBuffer());
        data.photo = await savePhoto(file.name, buffer);
      }
    } else {
      data = await request.json();
    }

    const saved = await addStone({
      stone_type: data.stone_type || "polished",
      shape: data.shape || "",
      carat: parseFloat(data.carat) || 0,
      color: data.color || "",
      clarity: data.clarity || "",
      cut: data.cut || "",
      certification: data.certification || "None",
      category: data.category || "",
      crystal_form: data.crystal_form || "",
      clarity_notes: data.clarity_notes || "",
      kp_status: data.kp_status === "true",
      price: data.price ? Number(data.price) : null,
      status: "Pending",
      photo: data.photo || "",
      source: "Consigned",
      trader_id: trader.id,
      commission: 0,
      photo_path: null,
      listing_category: data.listing_category || "Polished",
    });
    return NextResponse.json({ id: saved.id, ref: saved.ref });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
