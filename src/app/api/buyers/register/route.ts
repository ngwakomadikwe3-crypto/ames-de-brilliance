import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ID } from "node-appwrite";
import { ensureReady } from "@/lib/appwrite";
import { AppwriteBuyerStore } from "@/lib/buyers/appwrite-store";
import { registerBuyer } from "@/lib/buyers/service";
import { BUYER_TERMS_VERSION } from "@/lib/buyers/terms";
import { DuplicateEmailError } from "@/lib/buyers/types";
import { clientIp } from "@/lib/staff-auth";

export const runtime = "nodejs";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/;

const RegisterSchema = z.object({
  name: z.string().trim().min(2).max(255),
  email: z.string().trim().email().max(320),
  phone: z.string().trim().min(5).max(100),
  country: z.string().trim().min(2).max(100),
  entityType: z.enum(["individual", "company"]),
  // Licence number, type and expiry are REQUIRED (STEP 0 amendment 2). Staff
  // verify them at approval; an expired licence blocks offers.
  licenceNumber: z.string().trim().min(2).max(100),
  licenceType: z.string().trim().min(2).max(100),
  licenceExpiry: z
    .string()
    .trim()
    .regex(ISO_DATE_RE, "licenceExpiry must be an ISO date (YYYY-MM-DD)")
    .refine((v) => Number.isFinite(Date.parse(v)), "licenceExpiry must be a real date"),
  acceptTerms: z.literal(true),
});

export async function POST(request: NextRequest) {
  try {
    await ensureReady();
    const store = new AppwriteBuyerStore();

    const ip = clientIp(request);
    if (ip) {
      const allowed = await store.rateLimitHit(`register:ip:${ip}`, 3600, 10, new Date());
      if (!allowed) {
        return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
      }
    }

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
    }
    const parsed = RegisterSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
    }

    try {
      const buyer = await registerBuyer(store, {
        id: ID.unique(),
        name: parsed.data.name,
        email: parsed.data.email,
        phone: parsed.data.phone,
        country: parsed.data.country,
        entityType: parsed.data.entityType,
        licenceNumber: parsed.data.licenceNumber,
        licenceType: parsed.data.licenceType,
        licenceExpiry: parsed.data.licenceExpiry,
        termsVersion: BUYER_TERMS_VERSION,
      });
      return NextResponse.json({ ok: true, buyerId: buyer.id, status: buyer.status }, { status: 201 });
    } catch (error) {
      if (error instanceof DuplicateEmailError) {
        // Deliberately vague: do not confirm whether an account exists.
        return NextResponse.json({ ok: true, status: "pending" }, { status: 201 });
      }
      throw error;
    }
  } catch (error) {
    console.error("[buyers/register] failed:", error);
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
