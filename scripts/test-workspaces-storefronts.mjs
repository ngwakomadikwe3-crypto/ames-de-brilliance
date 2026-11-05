import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import * as profiles from '../src/lib/jeweller-profile.ts';
import { workspacePreferences, readWorkspacePreferences } from '../src/lib/customer-workspace.ts';
import { enquiryInput, changeEnquiry, enquiryView } from '../src/lib/customer-enquiry.ts';
const require = createRequire(import.meta.url), ts = require('typescript');
class ChatError extends Error { constructor(status, message) { super(message); this.status = status; } }
const exports = {};
vm.runInNewContext(ts.transpileModule(readFileSync('src/lib/jeweller-onboarding.ts','utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
  { exports, require: n => n === './jeweller-profile' ? profiles : n === './customer-session' || n === './jeweller-store' ? {} : n === './chat-security' ? { ChatError } : require(n) });
function completeProfile() {
  const p = profiles.newProfile('01900000-0000-4000-8000-000000000001', { businessName: 'Fixture studio', legalName: 'Private representative', registrationNumber: 'PRIVATE-REG', email: 'fixture@example.test', phone: '+26777123456', country: 'Botswana', city: 'Fixture city', address: 'PRIVATE-STREET-ADDRESS', biography: 'Isolated fixture biography. This is not a real business or commercial verification.', specialties: ['CAD'], consentConfirmed: true, eligibilityReason: 'Fixture eligibility statement only; not actual trading approval.' });
  p.files = ['identity','business','portfolio','portfolio','portfolio'].map((kind,i) => ({ id: `01900000-0000-4000-8000-00000000000${i+2}`, kind, mime: kind === 'identity' || kind === 'business' ? 'application/pdf' : 'image/png', filename: 'fixture', bytes: 20, sha256: String(i).repeat(64), uploadedAt: new Date().toISOString(), expiresOn: '' }));
  return p;
}
const shop = { slug: 'fixture-studio', bio: 'Public introduction only', showLocation: false, logoId: '', published: true, rightsConfirmed: true };
test('workspace preference is a UI choice, cannot carry verification or staff authority, and constrains saved references', () => {
  assert.equal(workspacePreferences.parse({}).role, 'customer');
  assert.throws(() => workspacePreferences.parse({ role: 'owner' }));
  assert.throws(() => workspacePreferences.parse({ role: 'jeweller', verified: true }));
  assert.throws(() => workspacePreferences.parse({ saved: ['../private'] }));
  assert.throws(() => workspacePreferences.parse({ saved: Array(81).fill('stone-ruby') }));
  assert.equal(readWorkspacePreferences({ role: 'owner' }).role, 'customer');
});
test('self-created business details cannot forge verification, linked accounts or storefront state', () => {
  const p = completeProfile();
  for (const key of ['portalUserId','verifiedUntil','status','checks','storefront']) assert.throws(() => profiles.profileInput.parse({ businessName: p.businessName, [key]: true }));
  const changed = profiles.editProfile(p, { businessName: 'Changed studio' }, 'account:fixture');
  assert.equal(changed.audit.at(-1).actor, 'account:fixture'); assert.equal(changed.status, 'draft');
});
test('storefront must be verified and have explicit public rights; identity documents can never be a logo', () => {
  const draft = completeProfile(); assert.throws(() => exports.checkStorefront(draft, shop));
  const p = profiles.reviewProfile(profiles.reviewProfile(draft, { action: 'submit' }), { action: 'verify', checks: Object.fromEntries(Object.keys(profiles.blankChecks()).map(k=>[k,true])), reason: 'Isolated fixture review only, not an actual business finding.', validUntil: new Date(Date.now()+180*86400000).toISOString().slice(0,10) });
  assert.throws(() => exports.checkStorefront(p, { ...shop, rightsConfirmed: false }));
  assert.throws(() => exports.checkStorefront(p, { ...shop, logoId: p.files[0].id }));
  assert.equal(exports.checkStorefront(p, { ...shop, logoId: p.files[2].id }).slug, shop.slug);
  assert.throws(() => exports.checkStorefront(p, { ...shop, slug: '../admin' }));
  assert.throws(() => exports.checkStorefront(p, { ...shop, slug: 'admin' }));
  p.status = 'suspended'; assert.throws(() => exports.checkStorefront(p, shop));
});
test('merchant sees their requirements and feedback, not internal staff checks or review audit', () => {
  const p = completeProfile(); p.audit.push({ action: 'verify', actor:'owner', at:new Date().toISOString(), reason:'INTERNAL-REVIEW' });
  const view = exports.selfProfile(p); assert.ok(view.gaps.length === 0); assert.equal(view.details.businessName, p.businessName); assert.ok(!('checks' in view)); assert.ok(!('audit' in view));
  assert.ok(!JSON.stringify(view).includes('INTERNAL-REVIEW'));
});
const record = () => ({ id:'thread', buyerId:'PRIVATE-BUYER-ID', sellerId:'PRIVATE-SELLER-ID', listingId:'listing', version:1, status:'open', buyerName:'Customer', buyerEmail:'private@example.test', businessName:'Studio', pieceName:'Piece', quote:null, messages:[], createdAt:'', updatedAt:'' });
test('enquiry creation requires consent and does not accept submitted customer ownership', () => {
  const id = '01900000-0000-4000-8000-000000000001';
  assert.throws(() => enquiryInput.parse({ listingId:id, message:'Please quote this piece.', contactConsent:false }));
  assert.throws(() => enquiryInput.parse({ listingId:id, message:'Please quote this piece.', contactConsent:true, buyerId:'another' }));
});
test('only the jeweller can quote and only the customer can request purchase of that quote', () => {
  const r = record(), quote = { amount:'2500.50', currency:'BWP', message:'Fixture sizing and availability terms.' };
  assert.throws(() => changeEnquiry(r,'quote','customer',quote)); assert.throws(() => changeEnquiry(r,'quote','staff',quote));
  const quoted = changeEnquiry(r,'quote','jeweller',quote); assert.equal(quoted.status,'quoted'); assert.deepEqual(quoted.quote,{amount:'2500.50',currency:'BWP'});
  assert.throws(() => changeEnquiry(quoted,'accept','jeweller',{}));
  const accepted = changeEnquiry(quoted,'accept','customer',{}); assert.equal(accepted.status,'accepted'); assert.ok(!('paid' in accepted)); assert.match(accepted.messages.at(-1).text,/Payment.*not recorded/);
  assert.throws(() => changeEnquiry(accepted,'quote','jeweller',quote));
});
test('thread messages and visibility stay bounded, versioned and private', () => {
  const r = record(), updated = changeEnquiry(r,'reply','customer',{message:'A private question'}); assert.equal(updated.version,2); assert.equal(updated.messages[0].by,'customer');
  for (const role of ['customer','jeweller','staff']) { const view = enquiryView(updated,role); assert.ok(!JSON.stringify(view).includes('PRIVATE-BUYER-ID')); assert.ok(!JSON.stringify(view).includes('PRIVATE-SELLER-ID')); }
  assert.ok(!('buyerEmail' in enquiryView(updated,'customer'))); assert.equal(enquiryView(updated,'jeweller').buyerEmail,r.buyerEmail);
  const closed = changeEnquiry(updated,'close','customer',{}); assert.throws(() => changeEnquiry(closed,'reply','jeweller',{message:'late'}));
  r.messages = Array(30).fill({by:'customer',text:'existing',at:''}); assert.throws(() => changeEnquiry(r,'reply','customer',{message:'too many'}));
});
