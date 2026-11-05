import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getListing, mutateListing } from '@/lib/jeweller-listing-store';
import { changeListing, uploadInput } from '@/lib/jeweller-listing';
import { workerAuthorization, workerLease } from '@/lib/jeweller-worker';
import { listingFailure, verifiedListingProfile } from '@/lib/jeweller-access';
import { readChatJson, privateHeaders } from '@/lib/chat-security';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  try {
    workerAuthorization(req); const body = await readChatJson(req), id = String(body.id || '');
    if (body.action === 'claim') {
      const record = await getListing(id); await verifiedListingProfile(record);
      const listing = await mutateListing(id, l => {
        if (!['draft', 'needs_revision', 'submitted'].includes(l.status) || !l.conversion || !(l.conversion.status === 'queued' || (l.conversion.status === 'processing' && Date.parse(l.conversion.leaseUntil || '') < Date.now()))) throw new Error('No queued conversion is available for this listing');
        const source = l.files.find(f => f.id === l.conversion!.sourceId && f.complete && f.kind === 'source');
        if (!source) throw new Error('Conversion source is missing');
        return changeListing(l, { files: l.files.filter(f => !['preview', 'poster'].includes(f.kind)), conversion: { ...l.conversion, status: 'processing', lease: randomUUID(), leaseUntil: new Date(Date.now() + 15 * 60000).toISOString() } }, 'worker_claimed', 'worker');
      });
      const file = listing.files.find(f => f.id === listing.conversion!.sourceId)!;
      return NextResponse.json({ id, name: listing.details.name, category: listing.details.category, conversion: listing.conversion,
        source: { id: file.id, name: file.name, bytes: file.bytes, sha256: file.sha256 } }, { headers: privateHeaders });
    }
    const listing = await mutateListing(id, l => {
      const conversion = workerLease(l, body.lease);
      if (body.action === 'start_file') {
        const file = uploadInput(body.file);
        if (l.files.length >= 12 || l.files.reduce((n, f) => n + f.bytes, 0) + file.bytes > 220 * 1024 * 1024) throw new Error('Listing file limit reached');
        if (!['preview', 'poster'].includes(file.kind) || l.files.some(f => f.kind === file.kind)) throw new Error('Worker can upload one preview and one product image');
        return changeListing(l, { files: [...l.files, { ...file, id: randomUUID(), parts: [], complete: false, createdAt: new Date().toISOString() }] }, 'worker_upload_started', 'worker');
      }
      if (body.action === 'finish') {
        const source = l.files.find(f => f.id === conversion.sourceId), preview = l.files.find(f => f.kind === 'preview' && f.complete), poster = l.files.find(f => f.kind === 'poster' && f.complete);
        if (!source || body.sourceSha256 !== source.sha256 || !preview || !poster || body.previewSha256 !== preview.sha256 || body.posterSha256 !== poster.sha256) throw new Error('Worker source or result checksum mismatch');
        return changeListing(l, { conversion: { ...conversion, status: 'ready', lease: undefined, leaseUntil: undefined } }, 'conversion_ready', 'worker');
      }
      if (body.action === 'fail') return changeListing(l, { conversion: { ...conversion, status: 'failed', lease: undefined, leaseUntil: undefined, error: 'Conversion failed. Check the source or provide a new mesh export.' } }, 'conversion_failed', 'worker');
      throw new Error('Unknown worker action');
    });
    return NextResponse.json(body.action === 'start_file' ? { file: listing.files.at(-1) } : { status: listing.conversion?.status }, { headers: privateHeaders });
  } catch (e) { return listingFailure(e); }
}
