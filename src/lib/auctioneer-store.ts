import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, readdir, open, unlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';
import { Query } from 'node-appwrite';
import { InputFile } from 'node-appwrite/file';
import { z } from 'zod';
import { getDb, getStorage, DB_ID } from './appwrite';
import { withListingLock } from './jeweller-listing-store';
import { jewellerPrivateBucket as auctioneerPrivateBucket, ensureJewellerPrivateBucket as ensureAuctioneerPrivateBucket } from './jeweller-private-bucket';
import { newProfile, recordChange, blankChecks, detectProfileFile, type AuctioneerProfile, type ProfileFile } from './auctioneer-profile';

const collectionId = 'auctioneer_profiles', bucketId = auctioneerPrivateBucket;
export const profileStorage = () => process.env.VERCEL || process.env.AMES_AUCTIONEER_STORAGE === 'appwrite' ? 'appwrite' : 'local';
const localRoot = () => resolve(/* turbopackIgnore: true */ process.env.AMES_AUCTIONEER_ROOT || join(process.env.LOCALAPPDATA || homedir(), 'AMES', 'private-auctioneers'));
const idCheck = (id: string) => z.uuid().parse(id);
const localPath = (id: string) => join(localRoot(), `${idCheck(id)}.json`);
const code = (error: unknown) => (error as { code?: number })?.code;
let ready: Promise<void> | undefined;
async function provision() {
  const db = getDb();
  try { await db.getCollection({ databaseId: DB_ID, collectionId }); }
  catch (e) { if (code(e) !== 404) throw e; try { await db.createCollection({ databaseId: DB_ID, collectionId, name: 'Private auctioneer profiles', permissions: [], documentSecurity: false }); } catch (conflict) { if (code(conflict) !== 409) throw conflict; } }
  await db.updateCollection({ databaseId: DB_ID, collectionId, name: 'Private auctioneer profiles', permissions: [], documentSecurity: false });
  const attrs = await db.listAttributes({ databaseId: DB_ID, collectionId });
  if (!attrs.attributes.some(attr => attr.key === 'payload')) try { await db.createStringAttribute({ databaseId: DB_ID, collectionId, key: 'payload', size: 65535, required: false }); } catch (conflict) { if (code(conflict) !== 409) throw conflict; }
  for (let i = 0; ; i++) {
    const current = await db.listAttributes({ databaseId: DB_ID, collectionId });
    if (current.attributes.some(attr => attr.key === 'payload' && attr.status === 'available')) break;
    if (i > 30) throw new Error('Private profile storage is not ready');
    await new Promise(done => setTimeout(done, 200));
  }
  await ensureAuctioneerPrivateBucket();
}
async function ensureStore() {
  if (profileStorage() === 'local') { await mkdir(localRoot(), { recursive: true, mode: 0o700 }); return; }
  if (!ready) ready = provision().catch(e => { ready = undefined; throw e; });
  await ready;
}
async function writeProfile(profile: AuctioneerProfile, create = false) {
  if (profileStorage() === 'local') {
    if (create) { await writeFile(localPath(profile.id), JSON.stringify(profile), { mode: 0o600, flag: 'wx' }); return profile; }
    const target = localPath(profile.id), temporary = `${target}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(profile), { mode: 0o600 });
    try { await rename(temporary, target); } finally { await unlink(temporary).catch(() => {}); }
  } else {
    const input = { databaseId: DB_ID, collectionId, documentId: profile.id, data: { payload: JSON.stringify(profile) } };
    if (create) await getDb().createDocument({ ...input, permissions: [] });
    else await getDb().updateDocument(input);
  }
  return profile;
}
export async function listProfiles(): Promise<AuctioneerProfile[]> {
  await ensureStore();
  if (profileStorage() === 'local') {
    const files = (await readdir(localRoot())).filter(name => /^[a-f0-9-]{36}\.json$/.test(name));
    const profiles = await Promise.all(files.map(async name => JSON.parse(await readFile(join(localRoot(), name), 'utf8')) as AuctioneerProfile));
    return profiles.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  const profiles: AuctioneerProfile[] = []; let cursor = '';
  for (;;) {
    const page = await getDb().listDocuments({ databaseId: DB_ID, collectionId, queries: [Query.limit(100), ...(cursor ? [Query.cursorAfter(cursor)] : [])] });
    profiles.push(...page.documents.map(row => JSON.parse(row.payload)).filter(p => typeof p.id === 'string' && typeof p.businessName === 'string') as AuctioneerProfile[]);
    if (page.documents.length < 100) break;
    cursor = page.documents[page.documents.length - 1].$id;
  }
  return profiles.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export async function getProfile(id: string): Promise<AuctioneerProfile> {
  idCheck(id); await ensureStore();
  const profile: AuctioneerProfile = profileStorage() === 'local' ? JSON.parse(await readFile(localPath(id), 'utf8'))
    : JSON.parse((await getDb().getDocument({ databaseId: DB_ID, collectionId, documentId: id })).payload);
  if (profile.id !== id) throw new Error('Profile identity mismatch');
  return profile;
}
export async function createProfile(input: unknown) {
  await ensureStore();
  return writeProfile(newProfile(randomUUID(), input), true);
}
export async function mutateProfile(id: string, version: number, update: (profile: AuctioneerProfile) => Promise<AuctioneerProfile> | AuctioneerProfile) {
  idCheck(id); await ensureStore();
  if (profileStorage() !== 'local') return withListingLock(id, async () => {
    const profile = await getProfile(id);
    if (profile.version !== version) throw new Error('Profile changed in another window. Reload before saving.');
    return writeProfile(await update(profile));
  });
  const lockPath = join(localRoot(), `${id}.lock`);
  const lock = profileStorage() === 'local' ? await open(lockPath, 'wx') : null;
  try {
    const profile = await getProfile(id);
    if (profile.version !== version) throw new Error('Profile changed in another window. Reload before saving.');
    return await writeProfile(await update(profile));
  } finally { if (lock) { await lock.close(); await unlink(lockPath); } }
}
export async function addProfileFile(id: string, version: number, file: File, kind: ProfileFile['kind'], expiresOn: string, actor = 'owner') {
  if (!file.size || file.size > 4 * 1024 * 1024) throw new Error('Choose a file up to 4 MB');
  if (expiresOn && !z.iso.date().safeParse(expiresOn).success) throw new Error('Invalid document expiry');
  const bytes = Buffer.from(await file.arrayBuffer()), mime = detectProfileFile(bytes);
  if (!mime || (['portrait'].includes(kind) && !mime.startsWith('image/'))) throw new Error('Use JPG, PNG or WebP images; evidence can also be PDF');
  const digest = createHash('sha256').update(bytes).digest('hex');
  return mutateProfile(id, version, async profile => {
    if (!profile.consentConfirmed) throw new Error('Confirm authority to retain documents before uploading');
    if (profile.files.length >= 32) throw new Error('Maximum 32 files per profile');
    if (kind === 'portrait' && profile.files.some(item => item.kind === 'portrait')) throw new Error('Remove the existing portrait first');
    if (kind === 'reference' && profile.files.filter(item => item.kind === kind).length >= 12) throw new Error('Maximum 12 reference files');
    if (profile.files.some(item => item.kind === kind && item.sha256 === digest)) throw new Error('This file is already attached in that category');
    const fileId = randomUUID(), extension = mime === 'application/pdf' ? 'pdf' : mime.split('/')[1] === 'jpeg' ? 'jpg' : mime.split('/')[1];
    if (profileStorage() === 'local') {
      await mkdir(join(localRoot(), 'files'), { recursive: true, mode: 0o700 });
      await writeFile(join(localRoot(), 'files', fileId), bytes, { mode: 0o600 });
    } else await getStorage().createFile({ bucketId, fileId, permissions: [], file: InputFile.fromBuffer(bytes, `${fileId}.${extension}`) });
    const entry: ProfileFile = { id: fileId, kind, filename: file.name.replace(/[\r\n]/g, '').slice(0, 160), bytes: bytes.length, mime, sha256: digest, uploadedAt: new Date().toISOString(), expiresOn };
    return recordChange(profile, { files: [...profile.files, entry], status: 'draft', checks: blankChecks(), verifiedUntil: '' }, 'file_added', `${kind}: ${entry.filename}; verification cleared`, new Date().toISOString(), actor);
  });
}
export async function readProfileFile(profileId: string, fileId: string) {
  idCheck(fileId);
  const profile = await getProfile(profileId), file = profile.files.find(item => item.id === fileId);
  if (!file) throw new Error('File not found');
  const bytes = profileStorage() === 'local' ? await readFile(join(localRoot(), 'files', fileId))
    : Buffer.from(await getStorage().getFileDownload({ bucketId, fileId }));
  if (createHash('sha256').update(bytes).digest('hex') !== file.sha256) throw new Error('Document checksum mismatch');
  return { bytes, file };
}
export async function removeProfileFile(id: string, version: number, fileId: string, actor = 'owner') {
  idCheck(fileId);
  const changed = await mutateProfile(id, version, profile => {
    if (!profile.files.some(item => item.id === fileId)) throw new Error('File not found');
    return recordChange(profile, { files: profile.files.filter(item => item.id !== fileId), status: 'draft', checks: blankChecks(), verifiedUntil: '' }, 'file_removed', 'Document removed; verification cleared', new Date().toISOString(), actor);
  });
  if (profileStorage() === 'local') await unlink(join(localRoot(), 'files', fileId)).catch(() => {});
  else await getStorage().deleteFile({ bucketId, fileId }).catch(() => {});
  return changed;
}

export async function createSelfProfile(accountId: string, input: unknown) {
  const existing = (await listProfiles()).filter(p => p.portalUserId === accountId);
  if (existing.length > 1) throw new Error('Ask staff to resolve duplicate business profiles');
  if (existing.length === 1) return existing[0];
  const bytes = createHash('sha256').update('ames-auctioneer-account:' + accountId).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 80; bytes[8] = (bytes[8] & 63) | 128;
  const h = bytes.toString('hex'), id = `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
  const profile = newProfile(id, input); profile.portalUserId = accountId;
  profile.audit = profile.audit.map(a => ({ ...a, actor: `account:${accountId}` }));
  try { return await writeProfile(profile, true); }
  catch (e) { if ((e as {code?:string|number}).code !== 'EEXIST' && code(e) !== 409) throw e; const current = await getProfile(id); if (current.portalUserId !== accountId) throw new Error('Profile ownership conflict'); return current; }
}
