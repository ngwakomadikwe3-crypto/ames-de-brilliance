import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ensureReady } from "@/lib/appwrite";
import { AppwriteBidderStore } from "@/lib/bidders/appwrite-store";
import { requestOtp } from "@/lib/bidders/otp";
import { sendMail } from "@/lib/email";
import { clientIp } from "@/lib/staff-auth";

export const runtime = "nodejs";

const RequestSchema = z.object({
  email: z.string().trim().email().max(320),
});

/**
 * Request a login code. ALWAYS answers success — the response must not reveal
 * whether an account exists. Rate limits are enforced with the shared store
 * (per email + per IP), never in-process memory.
 */
export async function POST(request: NextRequest) {
  try {
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

    const store = new AppwriteBidderStore();
    const email = parsed.data.email.toLowerCase();

    // Only registered, non-anonymised bidders get a code — silently.
    const bidder = await store.getBidderByEmail(email);
    if (bidder && !bidder.anonymisedAt) {
      const sent = await requestOtp(store, email, {
        ip: clientIp(request),
        sendCode: async (to, code) => {
          const sent = await sendMail({
            to,
            subject: "[AMES] Your auction sign-in code",
            text: `Your AMES auction room sign-in code is: ${code}\n\nIt expires in 10 minutes. If you did not request it, ignore this email.`,
          });
          if (!sent) {
            // Staging convenience only: SMTP unset means nobody can receive the
            // code, so it goes to the server log. Never in the HTTP response.
            console.log(`[bidders] OTP for ${to} (SMTP not configured): ${code}`);
          }
          return sent;
        },
      });
      console.log(`[bidders] OTP request for ${email}: ${sent ? "issued" : "dropped (rate limit or mail)"}`);
    }

    return NextResponse.json({ ok: true, message: "If the email is registered, a sign-in code is on its way." });
  } catch (error) {
    console.error("[bidders/request-code] failed:", error);
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
