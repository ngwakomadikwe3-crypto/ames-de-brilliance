import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getListing, mutateListing } from '@/lib/jeweller-listing-store';
import { listingAccess, listingFailure } from '@/lib/jeweller-access';
import { uploadInput, editable, changeListing, CHUNK_SIZE } from '@/lib/jeweller-listing';
import { checkChatOrigin, privateHeaders, readChatJson } from '@/lib/chat-security';
export const runtime = 'nodejs';
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    checkChatOrigin(req); const { id } = await params, body = await readChatJson(req);
    const actor = await listingAccess(req, await getListing(id));
    const input = uploadInput(body.file);
    const listing = await mutateListing(id, l => {
      if (body.version !== l.version) throw new Error('Reload this listing before uploading');
      if (!editable(l) && !(actor === 'owner' && l.status === 'submitted' && ['preview', 'poster'].includes(input.kind))) throw new Error('Files are locked during review and publication');
      if (l.conversion && ['queued', 'processing'].includes(l.conversion.status)) throw new Error('Wait for the current conversion to finish');
      if (l.files.length >= 12 || l.files.reduce((n, f) => n + f.bytes, 0) + input.bytes > 220 * 1024 * 1024) throw new Error('Maximum 12 files and 220 MB per listing');
      if (['preview', 'poster'].includes(input.kind) && l.files.some(f => f.kind === input.kind)) throw new Error('Remove the existing preview or image before replacing it');
      return changeListing(l, { files: [...l.files, { ...input, id: randomUUID(), parts: [], complete: false, createdAt: new Date().toISOString() }], review: null }, 'upload_started', actor);
    });
    return NextResponse.json({ listing, file: listing.files.at(-1), chunkSize: CHUNK_SIZE }, { status: 201, headers: privateHeaders });
  } catch (e) { return listingFailure(e); }
}
