import { NextRequest, NextResponse } from 'next/server';
import { getListing, mutateListing } from '@/lib/jeweller-listing-store';
import { listingAccess, listingFailure, verifiedListingProfile } from '@/lib/jeweller-access';
import { changeListing, editable, listingInput, approveListing, automaticReview } from '@/lib/jeweller-listing';
import { fileBytes, saveCompleteFile } from '@/lib/jeweller-listing-files';
import { deletePart } from '@/lib/jeweller-listing-store';
import { checkPieceGlb, compressPieceGlb } from '@/lib/ames-cad/check';
import { sendApprovalRequest } from '@/lib/email';
import { checkChatOrigin, readChatJson, privateHeaders, ChatError } from '@/lib/chat-security';
import { refreshLocalConversion, queueListingConversion } from '@/lib/jeweller-listing-conversion';
import { z } from 'zod';
export const runtime = 'nodejs';
export const maxDuration = 60;
type Context = { params: Promise<{ id: string }> };
export async function GET(req: NextRequest, { params }: Context) {
  try { const l = await getListing((await params).id); await listingAccess(req, l); return NextResponse.json(await refreshLocalConversion(l), { headers: privateHeaders }); }
  catch (e) { return listingFailure(e); }
}
export async function PATCH(req: NextRequest, { params }: Context) {
  try {
    checkChatOrigin(req); const { id } = await params, body = await readChatJson(req);
    const actor = await listingAccess(req, await getListing(id));
    let awaiting: { name: string; category: string } | null = null, replacedParts: string[] = [];
    const changed = await mutateListing(id, async l => {
      await listingAccess(req, l);
      if (body.version !== l.version) throw new Error('Listing changed. Reload before saving.');
      const action = String(body.action);
      if (action === 'save') {
        if (!editable(l)) throw new Error('Request a revision before editing a reviewed listing');
        if (['queued', 'processing'].includes(l.conversion?.status || '')) throw new Error('Wait for conversion before changing listing details');
        return changeListing(l, { details: listingInput.parse(body.details), review: null }, 'details_changed', actor);
      }
      if (action === 'convert') {
        if (!editable(l) && !(actor === 'owner' && l.status === 'submitted')) throw new Error('Only drafts and submissions can be converted');
        return queueListingConversion(l, body, actor);
      }
      if (action === 'submit') {
        if (!editable(l)) throw new Error('This listing is already under review');
        if (!l.details.rightsConfirmed || !l.files.some(f => f.kind === 'source' && f.complete)) throw new Error('Confirm your listing rights and upload a complete original CAD file');
        return changeListing(l, { status: 'submitted', review: null, reason: '' }, 'submitted', actor);
      }
      if (action === 'auto_publish' || action === 'submit_converted') {
        // A converted model, from staff or a jeweller, is checked here and sent to the Owner. Nothing goes live until the Owner approves.
        if (!editable(l)) throw new Error('This listing is already waiting for approval or published');
        await verifiedListingProfile(l);
        if (!l.details.rightsConfirmed) throw new Error('Confirm the listing rights before sending it for approval');
        const preview = l.files.find(f => f.kind === 'preview' && f.complete), poster = l.files.find(f => f.kind === 'poster' && f.complete);
        if (!preview || !poster || !l.files.some(f => f.kind === 'source' && f.complete)) throw new Error('Upload the original, the converted 3D model and the product image first');
        const raw = await fileBytes(preview), check = await checkPieceGlb(new Uint8Array(raw), `${l.details.name} ${l.details.description}`, l.details.name);
        const { category, confidence, reasons } = check.classification;
        // Keep the compressed web model in place of the converter's upload.
        const web = await saveCompleteFile('preview', 'model.glb', Buffer.from(await compressPieceGlb(new Uint8Array(raw))));
        replacedParts = preview.parts.map(p => p.id);
        // Stones read from the model fill the gemstone list when it was left empty (origins stay unstated).
        const gemstones = l.details.gemstones.length ? l.details.gemstones
          : check.gems.slice(0, 12).map(g => ({ name: g.pave === g.count ? `${g.name} (pavé)` : g.pave ? `${g.name} (${g.count - g.pave} + pavé)` : g.count > 1 ? `${g.name} ×${g.count}` : g.name, origin: '' }));
        const details = { ...l.details, category, gemstones };
        awaiting = { name: l.details.name, category };
        return changeListing(l, { details, status: 'submitted', reason: '', files: l.files.map(f => f.id === preview.id ? web : f),
          review: automaticReview({ ...l, details }, { triangles: check.triangles, stones: check.stones, melee: check.melee, size: check.size, category, confidence, reasons }) }, 'submitted_converted', actor, `Sorted into ${category} (${confidence}): ${reasons.join('; ')}`.slice(0, 500));
      }
      if (actor !== 'owner') throw new ChatError(403, 'Only the Owner can approve, publish or send back listings.');
      if (action === 'set_stock') {
        // The Owner sets how many are left at any time. The version stays, so open invoices for this piece still match.
        if (l.status === 'rejected') throw new Error('This listing was rejected');
        const stock = z.number().int().min(0).max(99999).nullable().parse(body.stock ?? null), at = new Date().toISOString();
        return { ...l, details: { ...l.details, stock }, updatedAt: at, audit: [...l.audit, { action: 'stock_set', at, actor, reason: stock == null ? 'not stated' : String(stock) }].slice(-80) };
      }
      if (action === 'approve_converted') {
        // The Owner approves a converted piece: its 3D model passed the automatic check when it was sent.
        if (l.status !== 'submitted' || !l.review?.automatic) throw new Error('Only converted pieces waiting for approval can be approved here');
        await verifiedListingProfile(l);
        const stock = body.stock === undefined ? l.details.stock : z.number().int().min(0).max(99999).nullable().parse(body.stock);
        return changeListing(l, { status: 'published', reason: '', details: { ...l.details, stock } }, 'published', actor, 'Approved by the Owner');
      }
      const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 1500) : '';
      if (['request_revision', 'reject', 'unpublish'].includes(action)) {
        if (reason.length < 10) throw new Error('Record a reason of at least 10 characters');
        if (action === 'unpublish' && l.status !== 'published') throw new Error('This listing is not published');
        return changeListing(l, { status: action === 'reject' ? 'rejected' : 'needs_revision', review: null, reason, conversion: l.conversion && ['queued','processing'].includes(l.conversion.status) ? { ...l.conversion, status: 'failed', lease: undefined, leaseUntil: undefined, error: 'Staff requested a revision.' } : l.conversion }, action, actor, reason);
      }
      if (action === 'approve') { await verifiedListingProfile(l); return changeListing(l, { status: 'approved', review: approveListing(l, body.review), reason: '' }, 'approved', actor); }
      if (action === 'publish') {
        await verifiedListingProfile(l);
        if (l.status !== 'approved' || !l.review || l.conversion?.status === 'processing' || l.conversion?.status === 'queued') throw new Error('Complete technical, visual, pricing and origin review before publication');
        return changeListing(l, { status: 'published' }, 'published', actor);
      }
      throw new Error('Unknown listing action');
    });
    for (const part of replacedParts) await deletePart(part).catch(() => {});
    // Assigned inside the mutation callback, which TypeScript's flow analysis cannot see.
    const notice = awaiting as { name: string; category: string } | null;
    if (notice) await sendApprovalRequest(changed.id, notice.name, notice.category).catch(() => false);
    return NextResponse.json(changed, { headers: privateHeaders });
  } catch (e) { return listingFailure(e); }
}
