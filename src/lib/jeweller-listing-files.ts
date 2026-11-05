import { createHash, randomUUID } from 'node:crypto';
import { CHUNK_SIZE, type ListingFile } from './jeweller-listing';
import { readPart, putPart, digest } from './jeweller-listing-store';
import { validateSource } from '../../scripts/cad/store.mjs';

export async function fileBytes(file: ListingFile) {
  if (!file.complete) throw new Error('Upload is incomplete');
  const bytes = Buffer.concat(await Promise.all(file.parts.map(readPart)));
  if (bytes.length !== file.bytes || digest(bytes) !== file.sha256) throw new Error('File integrity check failed');
  return bytes;
}
export async function saveCompleteFile(kind: ListingFile['kind'], name: string, bytes: Buffer): Promise<ListingFile> {
  const parts: ListingFile['parts'] = [];
  for (let start = 0; start < bytes.length; start += CHUNK_SIZE) parts.push(await putPart(bytes.subarray(start, start + CHUNK_SIZE)));
  return { id: randomUUID(), kind, name, bytes: bytes.length, sha256: digest(bytes), parts, complete: true, createdAt: new Date().toISOString() };
}
export function checkFileContent(file: ListingFile, bytes: Buffer) {
  if (file.kind === 'preview') { validateSource('preview.glb', bytes); return; }
  if (file.kind === 'source') return;
  const ext = file.name.split('.').pop()?.toLowerCase();
  const valid = ext === 'pdf' ? bytes.subarray(0, 5).toString() === '%PDF-' : ext === 'png' ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) : ['jpg', 'jpeg'].includes(ext || '') ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : ext === 'webp' && bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
  if (!valid) throw new Error('The file contents do not match the selected file type');
}
export async function boundedBody(req: Request, max = CHUNK_SIZE) {
  if (Number(req.headers.get('content-length')) > max) throw new Error('Upload chunk is too large');
  const reader = req.body?.getReader(); if (!reader) throw new Error('Missing file data');
  const parts: Uint8Array[] = []; let size = 0;
  try { for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > max) { await reader.cancel(); throw new Error('Upload chunk is too large'); } parts.push(value); } }
  finally { reader.releaseLock(); }
  return Buffer.concat(parts);
}
export function fileResponse(file: ListingFile, publicFile = false) {
  const name = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const mime = file.kind === 'preview' ? 'model/gltf-binary' : file.kind === 'poster' ? name.endsWith('.png') ? 'image/png' : name.endsWith('.webp') ? 'image/webp' : 'image/jpeg' : 'application/octet-stream';
  let index = 0, total = 0; const hash = createHash('sha256');
  const stream = new ReadableStream<Uint8Array>({ async pull(controller) {
    try {
      if (index === file.parts.length) {
        if (total !== file.bytes || hash.digest('hex') !== file.sha256) throw new Error('File integrity check failed');
        controller.close(); return;
      }
      const bytes = await readPart(file.parts[index++]); total += bytes.length; hash.update(bytes); controller.enqueue(new Uint8Array(bytes));
    } catch (e) { controller.error(e); }
  } });
  return new Response(stream, { headers: { 'Content-Type': mime, 'Content-Length': String(file.bytes), 'Content-Disposition': `${publicFile ? 'inline' : 'attachment'}; filename="${name}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', Vary: 'Cookie' } });
}
