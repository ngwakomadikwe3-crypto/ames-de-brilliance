import { NextRequest, NextResponse } from 'next/server';
import { Query, DatabasesIndexType } from 'node-appwrite';
import { getDb, DB_ID } from './appwrite';
import { newVisitor, privateDigest, verifyVisitor, VISITOR_AGE, VISITOR_COOKIE } from './visitor-session';

export class ChatError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const code = (error: unknown) => (error as { code?: number })?.code;
export const privateHeaders = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };

// Additive migration: no old conversations are deleted or assigned guessed owners.
let ready: Promise<void> | undefined;
export function ensureChatPrivacy() {
  if (!ready) ready = provision().catch(error => { ready = undefined; throw error; });
  return ready;
}
async function provision() {
  const db = getDb();
  for (const id of ['chats', 'chat_messages', 'request_limits']) {
    try { await db.getCollection({ databaseId: DB_ID, collectionId: id }); }
    catch (error) {
      if (code(error) !== 404) throw error;
      await db.createCollection({ databaseId: DB_ID, collectionId: id, name: id, permissions: [], documentSecurity: false }).catch(error => { if (code(error) !== 409) throw error; });
    }
    await db.updateCollection({ databaseId: DB_ID, collectionId: id, name: id, permissions: [], documentSecurity: false });
    const collection = await db.getCollection({ databaseId: DB_ID, collectionId: id });
    if (collection.$permissions.length || collection.documentSecurity) throw new Error('Chat storage must be private');
  }
  const schemas: Record<string, Record<string, number>> = {
    chats: { title: 255, owner_id: 48, provider_id: 128, created_at: 0, updated_at: 0 },
    chat_messages: { chat_id: 50, role: 20, text: 50000, thinking: 50000, created_at: 0 },
    request_limits: { expires_at: 0, count: -1 },
  };
  for (const [collectionId, fields] of Object.entries(schemas)) {
    const existing = await db.listAttributes({ databaseId: DB_ID, collectionId });
    for (const [key, size] of Object.entries(fields)) {
      if (existing.attributes.some(a => a.key === key)) continue;
      const params = { databaseId: DB_ID, collectionId, key, required: false };
      try {
        if (size === 0) await db.createDatetimeAttribute(params);
        else if (size === -1) await db.createIntegerAttribute({ ...params, min: 0, max: 10000 });
        else await db.createStringAttribute({ ...params, size });
      } catch (error) { if (code(error) !== 409) throw error; }
    }
    for (let attempt = 0; ; attempt++) {
      const result = await db.listAttributes({ databaseId: DB_ID, collectionId });
      if (Object.keys(fields).every(key => result.attributes.some(a => a.key === key && a.status === 'available'))) break;
      if (attempt >= 25) throw new Error('Chat schema is not ready');
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  for (const [collectionId, key, attributes] of [
    ['chats', 'private_owner', ['owner_id']],
    ['chat_messages', 'private_chat_date', ['chat_id', 'created_at']],
    ['request_limits', 'quota_expiry', ['expires_at']],
  ] as const) {
    try { await db.createIndex({ databaseId: DB_ID, collectionId, key, type: DatabasesIndexType.Key, attributes: [...attributes] }); }
    catch (error) { if (code(error) !== 409) throw error; }
    for (let attempt = 0; ; attempt++) {
      const result = await db.listIndexes({ databaseId: DB_ID, collectionId });
      if (result.indexes.some(index => index.key === key && index.status === 'available')) break;
      if (attempt >= 25) throw new Error('Chat index is not ready');
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
}

export function checkChatOrigin(req: NextRequest) {
  const origin = req.headers.get('origin');
  if (req.headers.get('sec-fetch-site') === 'cross-site' || (origin && origin !== new URL(req.url).origin)) throw new ChatError(403, 'Request not allowed');
  if (!['GET', 'HEAD'].includes(req.method) && !origin) throw new ChatError(403, 'Same-origin request required');
}
export function requireVisitor(req: NextRequest) {
  const id = verifyVisitor(req.cookies.get(VISITOR_COOKIE)?.value);
  if (!id) throw new ChatError(401, 'Please refresh AMES to start a private session');
  return id;
}
export async function visitorResponse(req: NextRequest, list: (id: string) => Promise<unknown>) {
  checkChatOrigin(req);
  let id = verifyVisitor(req.cookies.get(VISITOR_COOKIE)?.value);
  let token: string | undefined;
  if (!id) {
    // Only use platform-supplied addresses in production; local requests share a bucket.
    const address = process.env.VERCEL ? req.headers.get('x-vercel-forwarded-for') || 'unknown' : 'local';
    await consumeQuota(`session:${address}`, 30);
    ({ id, token } = newVisitor());
  }
  const response = NextResponse.json(await list(id), { headers: privateHeaders });
  if (token) response.cookies.set(VISITOR_COOKIE, token, { httpOnly: true, secure: new URL(req.url).protocol === 'https:', sameSite: 'strict', path: '/', maxAge: VISITOR_AGE });
  return response;
}
export async function consumeQuota(identity: string, maximum: number) {
  await ensureChatPrivacy();
  const minute = Math.floor(Date.now() / 60000);
  const documentId = privateDigest(`${identity}:${minute}`).slice(0, 36);
  const db = getDb(), base = { databaseId: DB_ID, collectionId: 'request_limits', documentId };
  try {
    await db.createDocument({ ...base, data: { count: 1, expires_at: new Date((minute + 2) * 60000).toISOString() }, permissions: [] });
    return;
  } catch (error) { if (code(error) !== 409) throw error; }
  try { await db.incrementDocumentAttribute({ ...base, attribute: 'count', value: 1, max: maximum }); }
  catch (error) { if (code(error) === 400) throw new ChatError(429, 'Please wait a minute before trying again'); throw error; }
}
export async function ownedChat(req: NextRequest, id: string) {
  checkChatOrigin(req);
  const owner = requireVisitor(req);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,35}$/.test(id)) throw new ChatError(404, 'Conversation not found');
  await ensureChatPrivacy();
  let chat;
  try { chat = await getDb().getDocument({ databaseId: DB_ID, collectionId: 'chats', documentId: id }); }
  catch (error) { if (code(error) === 404) throw new ChatError(404, 'Conversation not found'); throw error; }
  if (chat.owner_id !== owner) throw new ChatError(404, 'Conversation not found');
  return { chat, owner };
}
export function publicChat(chat: Record<string, unknown>) {
  return { id: chat.$id, title: chat.title, created_at: chat.created_at, updated_at: chat.updated_at };
}
export function chatFailure(error: unknown) {
  const status = error instanceof ChatError ? error.status : 503;
  if (!(error instanceof ChatError)) console.error('[chat] Private storage unavailable', { code: code(error), type: (error as { type?: string })?.type || 'internal' });
  return NextResponse.json({ error: error instanceof ChatError ? error.message : 'Private Chat is temporarily unavailable' }, { status, headers: { ...privateHeaders, ...(status === 429 ? { 'Retry-After': '60' } : {}) } });
}
export async function readChatJson(req: NextRequest) {
  const reader = req.body?.getReader();
  if (!reader) throw new ChatError(400, 'Request body required');
  const chunks: Uint8Array[] = []; let bytes = 0;
  while (true) {
    const result = await reader.read(); if (result.done) break;
    bytes += result.value.length;
    if (bytes > 16384) { await reader.cancel(); throw new ChatError(413, 'Message is too large'); }
    chunks.push(result.value);
  }
  try { const value = JSON.parse(Buffer.concat(chunks).toString()); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(); return value; }
  catch { throw new ChatError(400, 'Invalid request'); }
}
export async function listOwnedChats(owner: string) {
  await consumeQuota(`read:${owner}`, 120);
  // Bounded housekeeping removes only expired quota counters, never conversations.
  const expired = await getDb().listDocuments({ databaseId: DB_ID, collectionId: 'request_limits', queries: [Query.lessThan('expires_at', new Date().toISOString()), Query.limit(20)] });
  await Promise.all(expired.documents.map(document => getDb().deleteDocument({ databaseId: DB_ID, collectionId: 'request_limits', documentId: document.$id }).catch(error => { if (code(error) !== 404) throw error; })));
  const result = await getDb().listDocuments({ databaseId: DB_ID, collectionId: 'chats', queries: [Query.equal('owner_id', owner), Query.limit(100)] });
  return result.documents.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))).map(publicChat);
}
