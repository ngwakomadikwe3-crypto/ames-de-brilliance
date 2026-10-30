import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ID } from "node-appwrite";
import { ensureReady } from "@/lib/appwrite";
import { AppwriteBidderStore } from "@/lib/bidders/appwrite-store";
import { registerBidder } from "@/lib/bidders/service";
import { AUCTION_TERMS_VERSION } from "@/lib/bidders/terms";
import { DuplicateEmailError } from "@/lib/bidders/types";
import { clientIp } from "@/lib/staff-auth";

export const runtime = "nodejs";

const RegisterSchema = z.object({
  name: z.string().trim().min(2).max(255),
  email: z.string().trim().email().max(320),
  phone: z.string().trim().min(5).max(100),
  country: z.string().trim().min(2).max(100),
  entityType: z.enum(["individual", "company"]),
  licenceNumber: z.string().trim().max(100).optional().default(""),
  acceptTerms: z.literal(true),
});

export async function POST(request: NextRequest) {
  try {
    await ensureReady();
    const store = new AppwriteBidderStore();

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
      const bidder = await registerBidder(store, {
        id: ID.unique(),
        name: parsed.data.name,
        email: parsed.data.email,
        phone: parsed.data.phone,
        country: parsed.data.country,
        entityType: parsed.data.entityType,
        licenceNumber: parsed.data.licenceNumber,
        termsVersion: AUCTION_TERMS_VERSION,
      });
      return NextResponse.json({ ok: true, bidderId: bidder.id, status: bidder.status }, { status: 201 });
    } catch (error) {
      if (error instanceof DuplicateEmailError) {
        // Deliberately vague: do not confirm whether an account exists.
        return NextResponse.json({ ok: true, status: "pending" }, { status: 201 });
      }
      throw error;
    }
  } catch (error) {
    console.error("[bidders/register] failed:", error);
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
