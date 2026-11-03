import { NextRequest, NextResponse } from "next/server";
import { ensureReady } from "@/lib/appwrite";
import { getStaffSessionRole, staffActor } from "@/lib/staff-auth";
import { canManageLots } from "@/lib/lots/authz";
import { AppwriteLotStore } from "@/lib/lots/appwrite-store";
import { LOT_UPLOAD_TICKET_TTL_MS, lotModelMaxBytes, mintUploadTicket } from "@/lib/lots/model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Mint a GLB upload ticket for one lot (STEP d1, amendment 8 as adapted —
 * see lots/model.ts for the server-mediated deviation). The ticket is a
 * short-lived (2 min), single-purpose HMAC capability bound to the lot and
 * the staff actor; the upload endpoint accepts a ticket INSTEAD of trusting
 * a bare session cookie for a large binary POST.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await ensureReady();
    const role = await getStaffSessionRole(request.headers.get("cookie"));
    if (!canManageLots(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await context.params;
    const store = new AppwriteLotStore();
    const lot = await store.getLot(id);
    if (!lot) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }

    const ticket = mintUploadTicket({
      lotId: id,
      staff: staffActor(role as string),
      exp: Date.now() + LOT_UPLOAD_TICKET_TTL_MS,
    });
    if (!ticket) {
      return NextResponse.json({ ok: false, error: "signing_unavailable" }, { status: 503 });
    }
    return NextResponse.json(
      {
        ok: true,
        token: ticket.token,
        sig: ticket.sig,
        maxBytes: lotModelMaxBytes(),
        expiresInSeconds: LOT_UPLOAD_TICKET_TTL_MS / 1000,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[staff/lots/model-ticket] failed:", error);
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
