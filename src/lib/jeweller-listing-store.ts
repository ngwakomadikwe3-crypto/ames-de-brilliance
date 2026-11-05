import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, readdir, unlink, open } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { Query } from 'node-appwrite';
import { InputFile } from 'node-appwrite/file';
import { z } from 'zod';
import { getDb, getStorage, DB_ID } from './appwrite';
import { jewellerPrivateBucket, ensureJewellerPrivateBucket } from './jeweller-private-bucket';
import { CHUNK_SIZE, type JewellerListing } from './jeweller-listing';

const collectionId = 'jeweller-listings', locksId = 'jeweller-listing-locks', bucketId = jewellerPrivateBucket;
export const listingStorage = () => process.env.VERCEL || process.env.AMES_LISTING_STORAGE === 'appwrite' ? 'appwrite' : 'local';
const root = () => resolve(/* turbopackIgnore: true */ process.env.AMES_LISTING_ROOT || join(process.env.LOCALAPPDATA || homedir(), 'AMES', 'private-listings'));
const checked = (id: string) => z.uuid().parse(id);
export const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const code = (e: unknown) => (e as { code?: number }).code;
let ready: Promise<void> | undefined;
async function provision() {
  const db = getDb();
  for (const id of [collectionId, locksId]) {
    try { await db.getCollection({ databaseId: DB_ID, collectionId: id }); }
    catch (e) { if (code(e) !== 404) throw e; try { await db.createCollection({ databaseId: DB_ID, collectionId: id, name: id, permissions: [], documentSecurity: false }); } catch (conflict) { if (code(conflict) !== 409) throw conflict; } }
    const attrs = await db.listAttributes({ databaseId: DB_ID, collectionId: id });
    if (!attrs.attributes.some(a => a.key === 'payload')) try { await db.createStringAttribute({ databaseId: DB_ID, collectionId: id, key: 'payload', size: 65535, required: false }); } catch (e) { if (code(e) !== 409) throw e; }
    for (let i = 0; ; i++) {
      const attrs = await db.listAttributes({ databaseId: DB_ID, collectionId: id });
      if (attrs.attributes.some(a => a.key === 'payload' && a.status === 'available')) break;
      if (i > 30) throw new Error('Listing storage is preparing. Please retry shortly.');
      await new Promise(r => setTimeout(r, 200));
    }
  }
  await ensureJewellerPrivateBucket();
}
async function ensure() {
  if (listingStorage() === 'local') { await mkdir(join(root(), 'parts'), { recursive: true, mode: 0o700 }); return; }
  if (!ready) ready = provision().catch(e => { ready = undefined; console.error('Private listing storage provisioning failed', { code: code(e), type: (e as { type?: string }).type, message: e instanceof Error ? e.message : 'Unknown storage error' }); throw e; });
  await ready;
}
export async function getListing(id: string): Promise<JewellerListing> {
  checked(id); await ensure();
  const value = listingStorage() === 'local' ? JSON.parse(await readFile(join(root(), `${id}.json`), 'utf8')) : JSON.parse((await getDb().getDocument({ databaseId: DB_ID, collectionId, documentId: id })).payload);
  if (value.id !== id) throw new Error('Listing identity mismatch');
  return value;
}
export async function listListings(): Promise<JewellerListing[]> {
  await ensure();
  if (listingStorage() === 'local') {
    const ids = (await readdir(root())).filter(n => /^[a-f0-9-]{36}\.json$/.test(n));
    return (await Promise.all(ids.map(n => getListing(n.slice(0, -5))))).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  const records: JewellerListing[] = []; let cursor = '';
  for (;;) {
    const page = await getDb().listDocuments({ databaseId: DB_ID, collectionId, queries: [Query.limit(100), ...(cursor ? [Query.cursorAfter(cursor)] : [])] });
    records.push(...page.documents.filter(d => /^[a-f0-9-]{36}$/.test(d.$id)).map(d => JSON.parse(d.payload) as JewellerListing));
    if (page.documents.length < 100) break;
    cursor = page.documents.at(-1)!.$id;
  }
  return records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
async function writeListing(value: JewellerListing, create = false) {
  checked(value.id); await ensure();
  const payload = JSON.stringify(value);
  if (payload.length > 65000) throw new Error('Listing has reached its record limit');
  if (listingStorage() === 'local') {
    const tmp = join(root(), `${value.id}.${randomUUID()}.tmp`);
    await writeFile(tmp, payload, { mode: 0o600 });
    try { await rename(tmp, join(root(), `${value.id}.json`)); } finally { await unlink(tmp).catch(() => {}); }
  } else {
    const input = { databaseId: DB_ID, collectionId, documentId: value.id, data: { payload } };
    if (create) await getDb().createDocument({ ...input, permissions: [] }); else await getDb().updateDocument(input);
  }
  return value;
}
export async function createListing(value: JewellerListing) { return writeListing(value, true); }
export async function withListingLock<T>(id: string, operation: () => Promise<T>): Promise<T> {
  checked(id); await ensure(); const token = randomUUID(), lockId = id;
  const lockPath = join(root(), `${id}.lock`);
  let local: Awaited<ReturnType<typeof open>> | null = null;
  if (listingStorage() === 'local') local = await open(lockPath, 'wx').catch(() => { throw new Error('Listing is being saved. Retry shortly.'); });
  else {
    const input = { databaseId: DB_ID, collectionId: locksId, documentId: lockId };
    const previous = await getDb().getDocument(input).catch(e => { if (code(e) !== 404) throw e; return null; });
    if (previous && Date.parse(JSON.parse(previous.payload).expires) < Date.now()) await getDb().deleteDocument(input).catch(() => {});
    try { await getDb().createDocument({ ...input, permissions: [], data: { payload: JSON.stringify({ token, expires: new Date(Date.now() + 180000).toISOString() }) } }); }
    catch (e) { if (code(e) === 409) throw new Error('Listing is being saved. Retry shortly.'); throw e; }
  }
  try { return await operation(); }
  finally {
    if (local) { await local.close(); await unlink(lockPath); }
    else {
      const input = { databaseId: DB_ID, collectionId: locksId, documentId: lockId };
      const current = await getDb().getDocument(input).catch(() => null);
      if (current && JSON.parse(current.payload).token === token) await getDb().deleteDocument(input);
    }
  }
}
export async function putPart(bytes: Uint8Array) {
  if (!bytes.length || bytes.length > CHUNK_SIZE) throw new Error('Invalid upload chunk size');
  await ensure(); const id = randomUUID();
  if (listingStorage() === 'local') await writeFile(join(root(), 'parts', id), bytes, { mode: 0o600 });
  else await getStorage().createFile({ bucketId, fileId: id, permissions: [], file: InputFile.fromBuffer(Buffer.from(bytes), `${id}.bin`) });
  return { id, bytes: bytes.length, sha256: digest(bytes) };
}
export async function readPart(part: { id: string; bytes: number; sha256: string }) {
  checked(part.id); await ensure();
  const bytes = listingStorage() === 'local' ? await readFile(join(root(), 'parts', part.id)) : Buffer.from(await getStorage().getFileDownload({ bucketId, fileId: part.id }));
  if (bytes.length !== part.bytes || digest(bytes) !== part.sha256) throw new Error('File integrity check failed');
  return bytes;
}
export async function deletePart(id: string) {
  checked(id); await ensure();
  if (listingStorage() === 'local') await unlink(join(root(), 'parts', id)).catch(() => {});
  else await getStorage().deleteFile({ bucketId, fileId: id });
}

export async function mutateListing(id: string, update: (value: JewellerListing) => JewellerListing | Promise<JewellerListing>) {
  return withListingLock(id, async () => writeListing(await update(await getListing(id))));
}
const enquiryKey = (id: string) => 'enq.' + checked(id).replaceAll('-', '');
export async function readEnquiryRecord<T extends { id: string }>(id: string): Promise<T> {
  await ensure(); const key = enquiryKey(id);
  const record = listingStorage() === 'local' ? JSON.parse(await readFile(join(root(), key + '.json'), 'utf8')) : JSON.parse((await getDb().getDocument({ databaseId: DB_ID, collectionId, documentId: key })).payload);
  if (record.id !== id) throw new Error('Enquiry identity mismatch'); return record;
}
export async function writeEnquiryRecord<T extends { id: string }>(record: T, create = false): Promise<T> {
  await ensure(); const key = enquiryKey(record.id), payload = JSON.stringify(record); if (payload.length > 65000) throw new Error('Enquiry has reached its message limit');
  if (listingStorage() === 'local') {
    const target = join(root(), key + '.json');
    if (create) await writeFile(target, payload, { mode: 0o600, flag: 'wx' });
    else { const tmp = target + '.' + randomUUID() + '.tmp'; await writeFile(tmp, payload, { mode: 0o600 }); try { await rename(tmp, target); } finally { await unlink(tmp).catch(() => {}); } }
  } else { const input = { databaseId: DB_ID, collectionId, documentId: key, data: { payload } }; if (create) await getDb().createDocument({ ...input, permissions: [] }); else await getDb().updateDocument(input); }
  return record;
}
export async function listEnquiryRecords<T extends { id: string }>(): Promise<T[]> {
  await ensure();
  if (listingStorage() === 'local') { const names = (await readdir(root())).filter(n => /^enq\.[a-f0-9]{32}\.json$/.test(n)); return Promise.all(names.map(async n => JSON.parse(await readFile(join(root(), n), 'utf8')) as T)); }
  const records: T[] = []; let cursor = '';
  for (;;) { const page = await getDb().listDocuments({ databaseId: DB_ID, collectionId, queries: [Query.limit(100), ...(cursor ? [Query.cursorAfter(cursor)] : [])] }); records.push(...page.documents.filter(d => /^enq\.[a-f0-9]{32}$/.test(d.$id)).map(d => JSON.parse(d.payload) as T)); if (page.documents.length < 100) break; cursor = page.documents.at(-1)!.$id; }
  return records;
}
