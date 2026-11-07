// Loose-stone 3D for the Catalogue Room: the dealer's scan (private), the converted web model and its
// picture, and the Owner's approval. One record per inventory stone, in the private activity store.
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { activityId, readActivity, writeActivity, type Activity } from './account-activity-store';
import { withListingLock, putPart, deletePart, digest } from './jeweller-listing-store';
import { CHUNK_SIZE, type ListingFile } from './jeweller-listing';
import { fileBytes, saveCompleteFile } from './jeweller-listing-files';
import { checkStoneGlb, compressPieceGlb } from './ames-cad/check';
import { GEM_IDS } from './ames-cad/gems';

export type Stone3dField = 'scan' | 'model' | 'poster';
/** none → scan_uploaded (dealer) → awaiting_approval (staff converted) → approved / withdrawn (Owner). */
export type Stone3dStatus = 'none' | 'scan_uploaded' | 'converting' | 'awaiting_approval' | 'approved' | 'withdrawn';
export type Stone3dData = {
  version: number; stoneId: string; ref: string;
  scan: ListingFile | null; model: ListingFile | null; poster: ListingFile | null;
  source: 'scan' | 'specs' | null; gemId: string; size: number[]; note: string; approved: boolean;
  history: { action: string; at: string; by: string }[];
};
export const MAX_BYTES: Record<Stone3dField, number> = { scan: 80 * 1024 * 1024, model: 25 * 1024 * 1024, poster: 4 * 1024 * 1024 };
/** Scanner and CAD exports the converter reads. */
export const SCAN_FILE = /\.(stl|obj|ply|glb|gltf|fbx|3dm)$/i;
const KIND: Record<Stone3dField, ListingFile['kind']> = { scan: 'source', model: 'preview', poster: 'poster' };

export const stone3dKey = (stoneId: string) => activityId('stone3d', stoneId);
export const readStone3d = (stoneId: string) => readActivity<Stone3dData>(stone3dKey(stoneId));
function blank(stoneId: string, ref: string): Activity<Stone3dData> {
  return { id: stone3dKey(stoneId), kind: 'stone3d', owner: 'house', subject: stoneId, status: 'none', createdAt: new Date().toISOString(),
    data: { version: 1, stoneId, ref, scan: null, model: null, poster: null, source: null, gemId: '', size: [], note: '', approved: false, history: [] } };
}
/** What staff, dealers and the public may see of a record. */
export function stone3dSummary(record: Activity<Stone3dData> | null) {
  if (!record) return { status: 'none' as Stone3dStatus, scan: null, hasModel: false, approved: false, source: null, note: '', gemId: '', version: 0 };
  const d = record.data;
  return { status: record.status as Stone3dStatus, scan: d.scan ? { name: d.scan.name, bytes: d.scan.bytes, complete: d.scan.complete } : null,
    hasModel: !!(d.model?.complete && d.poster?.complete), approved: d.approved, source: d.source, note: d.note, gemId: d.gemId, version: d.version,
    revision: d.model?.sha256.slice(0, 12) || '' };
}

export const startInput = z.object({ name: z.string().trim().min(1).max(160), bytes: z.number().int().positive(), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict();

/** Begin a chunked upload of a stone's scan, model or picture (replacing any earlier one). */
export async function startStoneUpload(stoneId: string, ref: string, field: Stone3dField, input: unknown, by: string) {
  const v = startInput.parse(input);
  if (v.bytes > MAX_BYTES[field]) throw new Error(`This file is over ${Math.round(MAX_BYTES[field] / 1024 / 1024)} MB.`);
  if (field === 'scan' && !SCAN_FILE.test(v.name)) throw new Error('Upload the scan as STL, OBJ, PLY, GLB, FBX or 3DM.');
  if (field === 'model' && !/\.glb$/i.test(v.name)) throw new Error('The stone model must be a GLB file.');
  if (field === 'poster' && !/\.(webp|png|jpe?g)$/i.test(v.name)) throw new Error('The stone picture must be WebP, PNG or JPEG.');
  return withListingLock(stone3dKey(stoneId), async () => {
    const existing = await readStone3d(stoneId), record = existing || blank(stoneId, ref), old = record.data[field], at = new Date().toISOString();
    const file: ListingFile = { id: randomUUID(), kind: KIND[field], name: v.name, bytes: v.bytes, sha256: v.sha256, parts: [], complete: false, createdAt: at };
    const data: Stone3dData = { ...record.data, version: record.data.version + 1, history: [...record.data.history, { action: `${field}_started`, at, by }].slice(-40) };
    data[field] = file;
    // A new model or picture must be approved again before buyers see it.
    if (field !== 'scan') { data.approved = false; }
    const status: Stone3dStatus = field === 'scan' ? (record.status === 'none' ? 'scan_uploaded' : record.status as Stone3dStatus) : 'converting';
    const next = await writeActivity({ ...record, status, data }, !existing);
    if (old) for (const p of old.parts) await deletePart(p.id).catch(() => {});
    return next;
  });
}

/** Store the next 3 MB part of an upload, in order; the last part completes and verifies the file. */
export async function addStonePart(stoneId: string, field: Stone3dField, index: number, bytes: Uint8Array, by: string) {
  return withListingLock(stone3dKey(stoneId), async () => {
    const record = await readStone3d(stoneId), file = record?.data[field];
    if (!record || !file || file.complete) throw new Error('Start the upload first.');
    if (index !== file.parts.length) throw new Error('Upload the parts in order.');
    const sent = file.parts.reduce((n, p) => n + p.bytes, 0) + bytes.length;
    if (!bytes.length || bytes.length > CHUNK_SIZE || sent > file.bytes) throw new Error('Upload part does not match the file.');
    const part = await putPart(bytes), parts = [...file.parts, part], complete = sent === file.bytes, updated = { ...file, parts, complete };
    if (complete) {
      try { await fileBytes(updated); }
      catch (e) { for (const p of parts) await deletePart(p.id).catch(() => {}); const cleared: Stone3dData = { ...record.data, version: record.data.version + 1 }; cleared[field] = null; await writeActivity({ ...record, data: cleared }); throw e; }
    }
    const at = new Date().toISOString();
    const data: Stone3dData = { ...record.data, version: record.data.version + 1, history: complete ? [...record.data.history, { action: `${field}_uploaded`, at, by }].slice(-40) : record.data.history };
    data[field] = updated;
    return writeActivity({ ...record, data });
  });
}

const saveInput = z.object({ source: z.enum(['scan', 'specs']), gemId: z.string(), size: z.array(z.number().finite().nonnegative()).max(3), note: z.string().trim().max(400) });
/** Staff: check and compress the converted model, then send it to the Owner for approval. */
export async function saveStoneModel(stoneId: string, input: unknown, by: string) {
  const v = saveInput.parse(input);
  if (!GEM_IDS.has(v.gemId)) throw new Error('Unknown gemstone.');
  return withListingLock(stone3dKey(stoneId), async () => {
    const record = await readStone3d(stoneId);
    if (!record?.data.model?.complete || !record.data.poster?.complete) throw new Error('Upload the converted model and picture first.');
    const raw = await fileBytes(record.data.model); await checkStoneGlb(new Uint8Array(raw));
    const small = Buffer.from(await compressPieceGlb(new Uint8Array(raw))), web = await saveCompleteFile('preview', 'stone.glb', small);
    const old: ListingFile = record.data.model, at = new Date().toISOString();
    const next = await writeActivity({ ...record, status: 'awaiting_approval', data: { ...record.data, model: web, source: v.source, gemId: v.gemId, size: v.size, note: v.note, approved: false,
      version: record.data.version + 1, history: [...record.data.history, { action: 'sent_for_approval', at, by }].slice(-40) } });
    for (const p of old.parts) await deletePart(p.id).catch(() => {});
    return next;
  });
}

/** Owner: approve the stone's 3D for the Catalogue Room, or withdraw it. */
export async function decideStoneModel(stoneId: string, approve: boolean, by: string) {
  return withListingLock(stone3dKey(stoneId), async () => {
    const record = await readStone3d(stoneId);
    if (!record?.data.model?.complete || !record.data.poster?.complete) throw new Error('There is no converted 3D to approve.');
    if (approve && record.status !== 'awaiting_approval' && record.status !== 'withdrawn') throw new Error('This 3D is not waiting for approval.');
    const at = new Date().toISOString();
    return writeActivity({ ...record, status: approve ? 'approved' : 'withdrawn', data: { ...record.data, approved: approve, version: record.data.version + 1,
      history: [...record.data.history, { action: approve ? 'approved' : 'withdrawn', at, by }].slice(-40) } });
  });
}
export { digest };
