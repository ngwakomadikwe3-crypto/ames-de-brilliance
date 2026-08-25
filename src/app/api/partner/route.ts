import { NextRequest, NextResponse } from "next/server";
import { addTraderApplication } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();

    if (!data.name || !data.whatsapp) {
      return NextResponse.json(
        { error: "Name and WhatsApp are required" },
        { status: 400 }
      );
    }

    const trader = await addTraderApplication({
      name: data.name,
      company: data.company || "",
      country: data.country || "",
      whatsapp: data.whatsapp,
      email: data.email || "",
      licence: data.licence || "",
      licence_photo: data.licence_photo || "",
    });

    return NextResponse.json({
      ok: true,
      message:
        "Your application has been submitted. Our team will review it and be in touch.",
      trader: { id: trader.id, name: trader.name, status: trader.status },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
