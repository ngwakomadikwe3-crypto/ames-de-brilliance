import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { BUYER_DOCS_BUCKET, ensureReady, getStorage } from "@/lib/appwrite";
import { AppwriteBuyerStore } from "@/lib/buyers/appwrite-store";
import { canDecideBuyers } from "@/lib/buyers/authz";
import { anonymiseBuyer } from "@/lib/buyers/service";
import { getStaffSessionRole, staffActor } from "@/lib/staff-auth";

export const runtime = "nodejs";

const AnonymiseSchema = z.object({
  confirm: z.literal(true),
  reason: z.string().trim().max(500).optional().default(""),
});

/**
 * Erasure request: delete the buyer's document FILES from the private
 * bucket, drop the document metadata rows, then anonymise the buyer row.
 *
 * The row id SURVIVES on purpose: offers, deals and audit entries reference
 * only that pseudonymous id (never PII), so the immutable history and audit trail
 * stay intact and internally consistent while the person behind the id is
 * erased. After anonymisation the email no longer resolves (login is
 * impossible) and the resolver treats the account as gone.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await ensureReady();
    const role = await getStaffSessionRole(request.headers.get("cookie"));
    if (!canDecideBuyers(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
    }
    const parsed = AnonymiseSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
    }

    const { id } = await context.params;
    const store = new AppwriteBuyerStore();
    const buyer = await store.getBuyer(id);
    if (!buyer) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }

    // Delete document bytes first, then their metadata rows.
    const documents = await store.listDocuments(id);
    const storage = getStorage();
    for (const doc of documents) {
      try {
        await storage.deleteFile({ bucketId: BUYER_DOCS_BUCKET, fileId: doc.fileId });
      } catch (error) {
        // Already gone from the bucket is fine; anything else aborts so the
        // erasure never reports success while bytes remain.
        if ((error as { code?: number })?.code !== 404) throw error;
      }
      await store.deleteDocument(doc.id);
    }

    const ok = await anonymiseBuyer(store, id, staffActor(role as string));
    if (!ok) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, anonymised: true, documentsRemoved: documents.length });
  } catch (error) {
    console.error("[staff/buyers/anonymise] failed:", error);
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
