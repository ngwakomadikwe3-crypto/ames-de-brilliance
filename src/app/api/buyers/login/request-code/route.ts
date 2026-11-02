import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ensureReady } from "@/lib/appwrite";
import { AppwriteBuyerStore } from "@/lib/buyers/appwrite-store";
import { requestOtp } from "@/lib/buyers/otp";
import { mailConfigured, sendMail } from "@/lib/email";
import { isProductionEnv } from "@/lib/signing-labels";
import { clientIp } from "@/lib/staff-auth";

export const runtime = "nodejs";

const RequestSchema = z.object({
  email: z.string().trim().email().max(320),
});

/**
 * Request a login code. ALWAYS answers success — the response must not reveal
 * whether an account exists. Rate limits are enforced with the shared store
 * (per email + per IP), never in-process memory.
 *
 * Production posture (owner instruction 2026-11-01): when SMTP is not
 * configured, OTP login REFUSES to run in production (503) — a code nobody
 * can receive must never be issued. Outside production the code may be
 * logged to the server console as a staging convenience; in production the
 * code is never written to any log.
 */
export async function POST(request: NextRequest) {
  try {
    const production = isProductionEnv();
    if (production && !mailConfigured()) {
      console.error("[buyers/request-code] SMTP is not configured; OTP login is disabled in production");
      return NextResponse.json({ ok: false, error: "email_unconfigured" }, { status: 503 });
    }

    await ensureReady();

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
    }
    const parsed = RequestSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
    }

    const store = new AppwriteBuyerStore();
    const email = parsed.data.email.toLowerCase();

    // Only registered, non-anonymised buyers get a code — silently.
    const buyer = await store.getBuyerByEmail(email);
    if (buyer && !buyer.anonymisedAt) {
      const sent = await requestOtp(store, email, {
        ip: clientIp(request),
        sendCode: async (to, code) => {
          const sent = await sendMail({
            to,
            subject: "[AMES] Your catalogue sign-in code",
            text: `Your AMES DE BRILLANTE catalogue sign-in code is: ${code}\n\nIt expires in 10 minutes. If you did not request it, ignore this email.`,
          });
          if (!sent && !production) {
            // Staging convenience only: SMTP unset means nobody can receive the
            // code, so it goes to the server log. Never in the HTTP response,
            // never in production logs.
            console.log(`[buyers] OTP for ${to} (SMTP not configured): ${code}`);
          }
          return sent;
        },
      });
      console.log(`[buyers] OTP request for ${email}: ${sent ? "issued" : "dropped (rate limit or mail)"}`);
    }

    return NextResponse.json({ ok: true, message: "If the email is registered, a sign-in code is on its way." });
  } catch (error) {
    console.error("[buyers/request-code] failed:", error);
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
