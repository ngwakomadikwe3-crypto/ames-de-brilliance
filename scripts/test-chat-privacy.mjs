import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { NextRequest, NextResponse } from 'next/server.js';
import * as appwrite from 'node-appwrite';
import * as sessions from '../src/lib/visitor-session.ts';
import * as answers from '../src/lib/same-answer.ts';

process.env.SESSION_SECRET = 'test-only-secret-with-at-least-thirty-two-characters';
const failure = code => Object.assign(new Error(`test ${code}`), { code });
async function load(path, dependencies) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8'), exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, require: name => { assert.ok(name in dependencies, name); return dependencies[name]; }, Buffer, URL, process, setTimeout, console,
  });
  return exports;
}
async function fixture() {
  const collections = new Map(), attributes = new Map(), indexes = new Map(), documents = new Map();
  const key = p => `${p.collectionId}/${p.documentId}`;
  let writes = 0;
  const db = {
    async getCollection(p) { if (!collections.has(p.collectionId)) throw failure(404); return collections.get(p.collectionId); },
    async createCollection(p) { collections.set(p.collectionId, { $permissions: p.permissions, documentSecurity: p.documentSecurity }); },
    async updateCollection(p) { collections.set(p.collectionId, { $permissions: p.permissions, documentSecurity: p.documentSecurity }); },
    async listAttributes(p) { return { attributes: attributes.get(p.collectionId) || [] }; },
    async createStringAttribute(p) { attributes.set(p.collectionId, [...(attributes.get(p.collectionId) || []), { key: p.key, status: 'available' }]); },
    async createIntegerAttribute(p) { return this.createStringAttribute(p); },
    async createDatetimeAttribute(p) { return this.createStringAttribute(p); },
    async createIndex(p) { indexes.set(p.collectionId, [{ key: p.key, status: 'available' }]); },
    async listIndexes(p) { return { indexes: indexes.get(p.collectionId) || [] }; },
    async createDocument(p) { if (documents.has(key(p))) throw failure(409); writes++; const d = { $id: p.documentId, ...p.data }; documents.set(key(p), d); return d; },
    async getDocument(p) { if (!documents.has(key(p))) throw failure(404); return documents.get(key(p)); },
    async updateDocument(p) { writes++; const value = { ...await this.getDocument(p), ...p.data }; documents.set(key(p), value); return value; },
    async incrementDocumentAttribute(p) { const d = await this.getDocument(p); if (d.count + p.value > p.max) throw failure(400); d.count += p.value; return d; },
    async deleteDocument(p) { documents.delete(key(p)); },
    async listDocuments(p) {
      let result = [...documents].filter(([id]) => id.startsWith(`${p.collectionId}/`)).map(([, d]) => d);
      for (const text of p.queries || []) { const q = JSON.parse(text); if (q.method === 'equal') result = result.filter(d => q.values.includes(d[q.attribute])); if (q.method === 'lessThan') result = result.filter(d => d[q.attribute] < q.values[0]); }
      return { documents: result };
    },
  };
  const shared = { getDb: () => db, DB_ID: 'test', nowISO: () => new Date().toISOString(), doc: d => ({ ...d, id: d.$id }) };
  const base = { 'next/server': { NextRequest, NextResponse }, 'node-appwrite': appwrite, './appwrite': shared, './visitor-session': sessions };
  const security = await load('../src/lib/chat-security.ts', base);
  const dependencies = { ...base, '@/lib/appwrite': shared, '@/lib/chat-security': security, '@/lib/same-answer': answers };
  return { security, db, documents, collections, writes: () => writes,
    chats: await load('../src/app/api/chats/route.ts', dependencies),
    messages: await load('../src/app/api/chats/[id]/messages/route.ts', dependencies),
    chat: await load('../src/app/api/chats/[id]/route.ts', dependencies),
  };
}
function request(path, token, method = 'GET', body, origin = 'https://houseofames.com') {
  return new NextRequest(`https://houseofames.com${path}`, { method, headers: { origin, ...(token ? { cookie: `ames_visitor=${token}` } : {}), 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
const context = id => ({ params: Promise.resolve({ id }) });

test('signed visitor cookies reject tampering and expiry', () => {
  const visitor = sessions.newVisitor();
  assert.equal(sessions.verifyVisitor(visitor.token), visitor.id);
  assert.equal(sessions.verifyVisitor(visitor.token.slice(0, -1) + (visitor.token.endsWith('a') ? 'b' : 'a')), null);
  assert.equal(sessions.verifyVisitor(visitor.token, Date.now() + 31 * 86400000), null);
  assert.equal(sessions.verifyVisitor('invented'), null);
});
test('two visitors cannot list/read/write/rename each other’s conversations; unowned history stays private', async () => {
  const f = await fixture(), a = sessions.newVisitor(), b = sessions.newVisitor();
  const response = await f.chats.POST(request('/api/chats', a.token, 'POST'));
  assert.equal(response.status, 201); const chat = await response.json();
  f.documents.set('chats/legacy', { $id: 'legacy', title: 'Unowned legacy chat' });
  assert.equal((await (await f.chats.GET(request('/api/chats', a.token))).json()).length, 1);
  assert.equal((await (await f.chats.GET(request('/api/chats', b.token))).json()).length, 0);
  for (const id of [chat.id, 'legacy']) {
    const before = f.writes();
    assert.equal((await f.messages.GET(request(`/api/chats/${id}/messages`, b.token), context(id))).status, 404);
    assert.equal((await f.messages.POST(request(`/api/chats/${id}/messages`, b.token, 'POST', { role: 'user', text: 'intrusion' }), context(id))).status, 404);
    assert.equal((await f.chat.PATCH(request(`/api/chats/${id}`, b.token, 'PATCH', { title: 'intrusion' }), context(id))).status, 404);
    assert.equal(f.writes(), before);
  }
  assert.equal((await f.messages.GET(request('/api/chats/a/messages'), context(chat.id))).status, 401);
  assert.equal((await f.messages.POST(request('/api/chats/a/messages', a.token, 'POST', { role: 'assistant', text: 'forged SAME' }), context(chat.id))).status, 400);
  assert.equal((await f.chat.PATCH(request('/api/chats/a', a.token, 'PATCH', { owner_id: b.id, title: 'stolen' }), context(chat.id))).status, 400);
  const own = await f.messages.POST(request('/api/chats/a/messages', a.token, 'POST', { role: 'user', text: 'Hello' }), context(chat.id));
  assert.equal(own.status, 201);
  for (const value of f.collections.values()) { assert.deepEqual([...value.$permissions], []); assert.equal(value.documentSecurity, false); }
});
test('cross-site writes and oversized bodies are rejected', async () => {
  const f = await fixture(), a = sessions.newVisitor();
  assert.equal((await f.chats.POST(request('/api/chats', a.token, 'POST', {}, 'https://attacker.test'))).status, 403);
  assert.equal(f.writes(), 0);
  await assert.rejects(f.security.readChatJson(request('/api/ames', a.token, 'POST', { text: 'a'.repeat(17000) })), error => error.status === 413);
});
test('shared atomic counters enforce limits across overlapping requests', async () => {
  const f = await fixture();
  const results = await Promise.allSettled(Array.from({ length: 12 }, () => f.security.consumeQuota('same:visitor', 5)));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 5);
  for (const result of results.filter(result => result.status === 'rejected')) assert.equal(result.reason.status, 429);
});
test('session bootstrap sets private HttpOnly cookie; signing misconfiguration fails closed', async () => {
  const f = await fixture();
  const response = await f.chats.GET(request('/api/chats'));
  assert.equal(response.status, 200);
  const cookie = response.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/i); assert.match(cookie, /Secure/i); assert.match(cookie, /SameSite=strict/i);
  assert.match(response.headers.get('cache-control'), /no-store/);
  const old = process.env.SESSION_SECRET; delete process.env.SESSION_SECRET;
  try { assert.equal((await f.chats.GET(request('/api/chats'))).status, 503); } finally { process.env.SESSION_SECRET = old; }
});
