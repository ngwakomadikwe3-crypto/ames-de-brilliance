import { NextRequest, NextResponse } from 'next/server';
import { getListing, mutateListing } from '@/lib/jeweller-listing-store';
import { listingAccess, listingFailure, verifiedListingProfile } from '@/lib/jeweller-access';
import { changeListing, editable, listingInput, approveListing, automaticReview } from '@/lib/jeweller-listing';
import { fileBytes, saveCompleteFile } from '@/lib/jeweller-listing-files';
import { deletePart } from '@/lib/jeweller-listing-store';
import { checkPieceGlb, compressPieceGlb } from '@/lib/ames-cad/check';
import { sendAutoPublishNotice } from '@/lib/email';
import { checkChatOrigin, readChatJson, privateHeaders, ChatError } from '@/lib/chat-security';
import { refreshLocalConversion, queueListingConversion } from '@/lib/jeweller-listing-conversion';
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
    let published: { name: string; category: string } | null = null, replacedParts: string[] = [];
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
      if (action === 'auto_publish') {
        // Verified jeweller (or staff): publish a converter-made model after the server-side model check.
        if (!editable(l)) throw new Error('This listing is already under review or published');
        await verifiedListingProfile(l);
        if (!l.details.rightsConfirmed) throw new Error('Confirm your listing rights before publishing');
        const preview = l.files.find(f => f.kind === 'preview' && f.complete), poster = l.files.find(f => f.kind === 'poster' && f.complete);
        if (!preview || !poster || !l.files.some(f => f.kind === 'source' && f.complete)) throw new Error('Upload the original, the converted 3D model and the product image first');
        const raw = await fileBytes(preview), check = await checkPieceGlb(new Uint8Array(raw), `${l.details.name} ${l.details.description}`);
        const { category, confidence, reasons } = check.classification;
        // Publish the compressed web model in place of the converter's upload.
        const web = await saveCompleteFile('preview', 'model.glb', Buffer.from(await compressPieceGlb(new Uint8Array(raw))));
        replacedParts = preview.parts.map(p => p.id);
        published = { name: l.details.name, category };
        return changeListing(l, { details: { ...l.details, category }, status: 'published', reason: '', files: l.files.map(f => f.id === preview.id ? web : f),
          review: automaticReview(l, { triangles: check.triangles, stones: check.stones, melee: check.melee, size: check.size, category, confidence, reasons }) }, 'auto_published', actor, `Sorted into ${category} (${confidence}): ${reasons.join('; ')}`.slice(0, 500));
      }
      if (actor !== 'owner') throw new ChatError(403, 'Only staff can approve or publish listings.');
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
    if (published) await sendAutoPublishNotice(changed.id, published.name, published.category).catch(() => false);
    return NextResponse.json(changed, { headers: privateHeaders });
  } catch (e) { return listingFailure(e); }
}
