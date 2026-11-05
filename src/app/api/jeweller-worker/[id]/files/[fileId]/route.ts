import { NextRequest, NextResponse } from 'next/server';
import { workerAuthorization, workerLease } from '@/lib/jeweller-worker';
import { getListing, mutateListing, putPart, readPart, deletePart, digest } from '@/lib/jeweller-listing-store';
import { changeListing, CHUNK_SIZE } from '@/lib/jeweller-listing';
import { listingFailure } from '@/lib/jeweller-access';
import { fileResponse, boundedBody, checkFileContent } from '@/lib/jeweller-listing-files';
type Context = { params: Promise<{ id: string; fileId: string }> };
export const runtime = 'nodejs';
export async function GET(req: NextRequest, { params }: Context) {
  try {
    workerAuthorization(req); const { id, fileId } = await params, l = await getListing(id), conversion = workerLease(l, req.headers.get('x-cad-lease'));
    const file = l.files.find(f => f.id === fileId && f.id === conversion.sourceId && f.complete && f.kind === 'source');
    if (!file) throw new Error('Source not available to this worker');
    return fileResponse(file);
  } catch (e) { return listingFailure(e); }
}
export async function PUT(req: NextRequest, { params }: Context) {
  let uploaded: string | null = null;
  try {
    workerAuthorization(req); const { id, fileId } = await params, bytes = await boundedBody(req), index = Number(req.nextUrl.searchParams.get('part'));
    if (!Number.isInteger(index) || index < 0 || !bytes.length) throw new Error('Invalid worker file part');
    await mutateListing(id, async l => {
      workerLease(l, req.headers.get('x-cad-lease'));
      const file = l.files.find(f => f.id === fileId && ['preview', 'poster'].includes(f.kind));
      if (!file) throw new Error('Worker output not registered');
      if (file.parts[index]) { if (file.parts[index].sha256 !== digest(bytes)) throw new Error('Conflicting worker output'); return l; }
      if (file.complete || index !== file.parts.length || bytes.length !== Math.min(CHUNK_SIZE, file.bytes - index * CHUNK_SIZE)) throw new Error('Invalid worker output sequence');
      const part = await putPart(bytes); uploaded = part.id;
      const parts = [...file.parts, part], complete = parts.reduce((n, p) => n + p.bytes, 0) === file.bytes;
      if (complete) { const all = Buffer.concat(await Promise.all(parts.map(readPart))); if (digest(all) !== file.sha256) throw new Error('Worker output checksum failed'); checkFileContent(file, all); }
      return changeListing(l, { files: l.files.map(f => f.id === fileId ? { ...file, parts, complete } : f) }, 'worker_output_uploaded', 'worker');
    });
    uploaded = null; return NextResponse.json({ ok: true });
  } catch (e) { if (uploaded) await deletePart(uploaded).catch(() => {}); return listingFailure(e); }
}
