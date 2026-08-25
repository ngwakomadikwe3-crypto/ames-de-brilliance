import { NextRequest, NextResponse } from "next/server";
import { addRequest } from "@/lib/db";
import { sendSourcingNotification } from "@/lib/email";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const d = (k: string) => (formData.get(k) as string) || "";
    const consent = formData.get("consent") === "on" || formData.get("consent") === "true";
    const declaration = formData.get("declaration") === "on" || formData.get("declaration") === "true";
    const saved = await addRequest({
      buyer_name: d("name"), company: d("company"), country: d("country"),
      contact: d("contact"), type: d("type"), shape: d("shape"),
      carat_min: d("caratMin"), carat_max: d("caratMax"), color: d("color"),
      clarity: d("clarity"), certification: d("certification"), notes: d("notes"),
      kp_licence: d("kpLicence"), kp_country: d("kpCountry"),
      consent, declaration, consent_timestamp: new Date().toISOString(),
    });

    // Send email notification (non-blocking — don't fail the submission if email fails)
    sendSourcingNotification({
      id: saved.id, buyer_name: d("name"), company: d("company"), country: d("country"),
      contact: d("contact"), type: d("type"), shape: d("shape"),
      carat_min: d("caratMin"), carat_max: d("caratMax"), color: d("color"),
      clarity: d("clarity"), certification: d("certification"), notes: d("notes"),
      kp_licence: d("kpLicence") || undefined, kp_country: d("kpCountry") || undefined,
    }).catch(() => {}); // fire-and-forget

    return NextResponse.json({ id: saved.id });
  } catch { return NextResponse.json({ error: "Failed" }, { status: 500 }); }
}
