import { NextRequest, NextResponse } from 'next/server';
import { getListing, mutateListing, putPart, deletePart, digest, readPart } from '@/lib/jeweller-listing-store';
import { listingAccess, listingFailure } from '@/lib/jeweller-access';
import { editable, changeListing, CHUNK_SIZE } from '@/lib/jeweller-listing';
import { fileResponse, boundedBody, checkFileContent } from '@/lib/jeweller-listing-files';
import { checkChatOrigin, privateHeaders } from '@/lib/chat-security';
type Context = { params: Promise<{ id: string; fileId: string }> };
export const runtime = 'nodejs';
export async function GET(req: NextRequest, { params }: Context) {
  try { const { id, fileId } = await params, l = await getListing(id); await listingAccess(req, l); const file = l.files.find(f => f.id === fileId && f.complete); if (!file) throw new Error('File not found'); return fileResponse(file); }
  catch (e) { return listingFailure(e); }
}
export async function PUT(req: NextRequest, { params }: Context) {
  let uploaded: string | null = null;
  try {
    checkChatOrigin(req); const { id, fileId } = await params;
    const actor = await listingAccess(req, await getListing(id)), bytes = await boundedBody(req), index = Number(req.nextUrl.searchParams.get('part'));
    if (!Number.isInteger(index) || index < 0 || !bytes.length) throw new Error('Invalid upload part');
    const listing = await mutateListing(id, async l => {
      const file = l.files.find(f => f.id === fileId); if (!file) throw new Error('Upload not found');
      if (!editable(l) && !(actor === 'owner' && l.status === 'submitted' && ['preview', 'poster'].includes(file.kind))) throw new Error('Files are locked during review and publication');
      if (file.parts[index]) { if (file.parts[index].sha256 !== digest(bytes)) throw new Error('Conflicting upload part'); return l; }
      if (file.complete || index !== file.parts.length || bytes.length !== Math.min(CHUNK_SIZE, file.bytes - index * CHUNK_SIZE)) throw new Error('Upload parts must arrive in order and match the declared size');
      if (index === 0 && file.kind !== 'preview') checkFileContent(file, bytes);
      const part = await putPart(bytes); uploaded = part.id;
      const parts = [...file.parts, part], complete = parts.reduce((n, p) => n + p.bytes, 0) === file.bytes;
      if (complete) {
        const all = Buffer.concat(await Promise.all(parts.map(readPart)));
        if (digest(all) !== file.sha256) throw new Error('Uploaded file checksum does not match. Remove it and retry.');
        checkFileContent(file, all);
      }
      return changeListing(l, { files: l.files.map(f => f.id === fileId ? { ...file, parts, complete } : f) }, complete ? 'upload_completed' : 'upload_part', actor);
    });
    uploaded = null; return NextResponse.json(listing, { headers: privateHeaders });
  } catch (e) { if (uploaded) await deletePart(uploaded).catch(() => {}); return listingFailure(e); }
}
export async function DELETE(req: NextRequest, { params }: Context) {
  try {
    checkChatOrigin(req); const { id, fileId } = await params, original = await getListing(id), actor = await listingAccess(req, original);
    const removed = original.files.find(f => f.id === fileId); if (!removed) throw new Error('File not found');
    const listing = await mutateListing(id, l => {
      if ((!editable(l) && !(actor === 'owner' && l.status === 'submitted' && ['preview', 'poster'].includes(removed.kind))) || ['queued', 'processing'].includes(l.conversion?.status || '')) throw new Error('Wait for review or conversion before removing files');
      return changeListing(l, { files: l.files.filter(f => f.id !== fileId), review: null }, 'file_removed', actor);
    });
    await Promise.all(removed.parts.map(p => deletePart(p.id).catch(() => {})));
    return NextResponse.json(listing, { headers: privateHeaders });
  } catch (e) { return listingFailure(e); }
}
