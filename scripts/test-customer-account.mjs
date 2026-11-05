import assert from 'node:assert/strict';
import { test, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const { NextRequest, NextResponse } = require('next/server');
let calls, providerError, userOverride;
class ChatError extends Error { constructor(status, message) { super(message); this.status = status; } }
const user = { name: 'Customer', email: 'customer@example.invalid', emailVerification: false, prefs: { unrelated: 'preserve', amesHaptics: false }, labels: ['owner'], password: 'never-expose' };
class Client { setEndpoint() { return this; } setProject() { return this; } setKey(key) { this.key = key; return this; } setSession(secret) { this.secret = secret; return this; } }
class Account {
 constructor(client) { this.client = client; }
 async get() { calls.push(['get', this.client]); if (providerError) throw providerError; return userOverride || user; }
 async updatePassword(data) { calls.push(['password', data, this.client]); return userOverride || user; }
 async updateEmail(data) { calls.push(['email', data, this.client]); return { ...(userOverride || user), email: data.email, emailVerification: false }; }
 async create(data) { calls.push(['create', data]); }
 async createEmailPasswordSession(data) { calls.push(['login', data, this.client]); return { secret: 'private-session', expire: '2030-01-01T00:00:00Z' }; }
 async updatePrefs(data) { calls.push(['prefs', data, this.client]); return user; }
 async updateName(data) { calls.push(['name', data, this.client]); return { ...user, ...data }; }
 async deleteSession(data) { calls.push(['logout', data, this.client]); }
 async createRecovery(data) { calls.push(['recover', data, this.client]); }
 async updateRecovery(data) { calls.push(['reset', data, this.client]); }
 async createVerification(data) { calls.push(['verify', data, this.client]); }
 async updateVerification(data) { calls.push(['confirm', data, this.client]); }
}
const source = ts.transpileModule(readFileSync('src/app/api/customer/route.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const module = { exports: {} };
vm.runInNewContext(source, { exports: module.exports, module, URL, process: { env: { APPWRITE_ENDPOINT: 'https://example.invalid/v1', APPWRITE_PROJECT_ID: 'project', APPWRITE_API_KEY: 'server-only-key' } }, require(name) {
 if (name === 'next/server') return { NextResponse };
 if (name === 'node-appwrite') return { Account, Client, ID: { unique: () => 'new-id' } };
 if (name.includes('customer-preferences')) return { normalizeDisplayName: value => value.trim().replace(/\s+/g, ' ') };
 if (name.includes('chat-security')) return { ChatError, privateHeaders: { 'Cache-Control': 'private, no-store' }, checkChatOrigin: () => {}, readChatJson: request => request.json(), consumeQuota: async (...args) => calls.push(['quota', ...args]) };
 throw Error(name);
} });
const api = module.exports;
function request(body, cookie, origin = 'https://houseofames.com') { return new NextRequest('https://houseofames.com/api/customer', { method: body ? 'POST' : 'GET', headers: { origin, ...(cookie ? { cookie: `ames_customer_session=${cookie}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }); }
beforeEach(() => { calls = []; providerError = undefined; userOverride = undefined; });
test('guest response is private and makes no provider call', async () => { const r = await api.GET(request()); assert.deepEqual(await r.json(), { user: null }); assert.match(r.headers.get('cache-control'), /no-store/); assert.equal(calls.length, 0); });
test('customer session reads only a safe profile and never uses admin key', async () => { const r = await api.GET(request(null, 'alice')); assert.deepEqual(await r.json(), { user: { name: user.name, email: user.email, verified: false, haptics: false } }); assert.equal(calls[0][1].secret, 'alice'); assert.equal(calls[0][1].key, undefined); });
test('login has quotas and returns only HttpOnly secure session cookie', async () => { const r = await api.POST(request({ action: 'login', email: 'Customer@example.invalid', password: 'testpassword' })); assert.equal(r.status, 200); const cookie = r.headers.get('set-cookie'); for (const part of ['HttpOnly', 'Secure', 'SameSite=lax', 'Path=/']) assert.ok(cookie.includes(part)); assert.ok(!JSON.stringify(await r.json()).includes('private-session')); assert.equal(calls.filter(c => c[0] === 'quota').length, 2); assert.equal(calls.find(c => c[0] === 'get')[1].key, undefined); });
test('cross-origin and missing-origin sign-in rejected before provider access', async () => { for (const origin of ['https://evil.invalid', '']) { const r = await api.POST(request({ action: 'login' }, undefined, origin)); assert.equal(r.status, 403); } assert.equal(calls.length, 0); });
test('anonymous profile writes rejected; submitted identity cannot select another account', async () => { const data = { action: 'profile', name: '  New   Name ', haptics: true, userId: 'victim', role: 'owner' }; assert.equal((await api.POST(request(data))).status, 401); const r = await api.POST(request(data, 'alice')); assert.equal(r.status, 200); const prefs = calls.find(c => c[0] === 'prefs'); assert.equal(prefs[1].prefs.unrelated, 'preserve'); assert.equal(prefs[2].secret, 'alice'); assert.equal(calls.find(c => c[0] === 'name')[1].name, 'New Name'); });
test('registration validates password before creating any account', async () => { const r = await api.POST(request({ action: 'register', name: 'Test', email: 'test@example.invalid', password: 'short' })); assert.equal(r.status, 400); assert.equal(calls.length, 0); });
test('recovery URL is fixed to this site and ignores supplied URL', async () => { const r = await api.POST(request({ action: 'recover', email: 'test@example.invalid', url: 'https://evil.invalid' })); assert.equal(r.status, 200); assert.equal(calls[0][1].url, 'https://houseofames.com/app/account?flow=reset'); assert.equal(calls[0][2].key, undefined); });
test('logout revokes provider session and clears only customer cookie', async () => { const r = await api.POST(request({ action: 'logout' }, 'alice')); assert.equal(calls[0][2].secret, 'alice'); assert.match(r.headers.get('set-cookie'), /ames_customer_session=;/); assert.doesNotMatch(r.headers.get('set-cookie'), /adb_session/); });
test('provider outages and expired sessions never produce guest success or leak diagnostics', async () => { providerError = { code: 503, message: 'secret internal diagnostics' }; const r = await api.GET(request(null, 'alice')); assert.equal(r.status, 503); assert.ok(!JSON.stringify(await r.json()).includes('diagnostics')); providerError = { code: 401 }; assert.equal((await api.GET(request(null, 'alice'))).status, 401); });
test('expired project keys are reported as service failures rather than bad customer passwords', async () => { providerError = { code: 401, type: 'project_key_expired' }; const r = await api.GET(request(null, 'alice')); assert.equal(r.status, 503); });
test('social contact completion stays session-bound and never overwrites an existing email', async () => {
 const body = { action: 'complete-social-email', email: 'contact@example.invalid', password: 'a-long-fixture-password' };
 assert.equal((await api.POST(request(body))).status,401);
 assert.equal((await api.POST(request(body,'social-user'))).status,400);
 assert.ok(!calls.some(c=>c[0]==='password'||c[0]==='email'));
});
test('social users without email can set their own contact details without receiving automatic verification', async () => {
 userOverride={...user,$id:'social-user',email:'',emailVerification:false,passwordUpdate:''};
 const r=await api.POST(request({action:'complete-social-email',email:'contact@example.invalid',password:'a-long-fixture-password',userId:'victim',role:'owner'},'social-user'));
 assert.equal(r.status,200);assert.equal((await r.json()).user.verified,false);assert.equal(calls.find(c=>c[0]==='password')[2].secret,'social-user');assert.equal(calls.find(c=>c[0]==='email')[2].key,undefined);assert.ok(calls.some(c=>c[0]==='quota'));
});
test('retrying email completion does not reset an existing password; invalid fields change nothing', async () => {
 userOverride={...user,$id:'social-user',email:'',passwordUpdate:'2026-01-01'};
 assert.equal((await api.POST(request({action:'complete-social-email',email:'invalid',password:'short'},'social-user'))).status,400);
 assert.ok(!calls.some(c=>c[0]==='email'||c[0]==='password'));
 assert.equal((await api.POST(request({action:'complete-social-email',email:'contact@example.invalid',password:'a-long-fixture-password'},'social-user'))).status,200);
 assert.ok(!calls.some(c=>c[0]==='password'));
});
test('expired customer cookies are cleared so a fresh social sign-in can start; outages retain the session', async () => {
 providerError={code:401};const expired=await api.GET(request(null,'expired'));assert.equal(expired.status,401);assert.match(expired.headers.get('set-cookie'),/ames_customer_session=;/);
 providerError={code:503};const outage=await api.GET(request(null,'existing'));assert.equal(outage.status,503);assert.equal(outage.headers.get('set-cookie'),null);
});
