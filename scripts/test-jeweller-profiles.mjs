import assert from 'node:assert/strict';
import { test } from 'node:test';
import { newProfile, editProfile, recordChange, blankChecks, profileGaps, reviewProfile, effectiveProfileStatus, detectProfileFile } from '../src/lib/jeweller-profile.ts';
const now = '2026-10-27T12:00:00Z';
const input = { businessName: 'QA studio', legalName: 'QA representative', registrationNumber: 'TEST-ONLY', email: 'qa@example.com', phone: '+26777123456',
  country: 'Botswana', city: 'Gaborone', address: 'QA fixture address', biography: 'This is a test fixture for private onboarding and is not a real jeweller profile.', specialties: ['CAD'],
  consentConfirmed: true, eligibilityReason: 'Test fixture only: eligibility is not a real-world finding.' };
function complete() {
  const profile = newProfile('01900000-0000-4000-8000-000000000001', input, now);
  profile.files = ['identity', 'business', 'portfolio', 'portfolio', 'portfolio'].map((kind, i) => ({ id: `01900000-0000-4000-8000-00000000000${i + 2}`, kind,
    filename: 'fixture.png', mime: 'image/png', bytes: 100, sha256: String(i).repeat(64), uploadedAt: now, expiresOn: '' }));
  return profile;
}
const checked = Object.fromEntries(Object.keys(blankChecks()).map(key => [key, true]));
test('profile creation is draft-only and cannot accept forged verification state', () => {
  assert.equal(newProfile('id', input, now).status, 'draft');
  assert.throws(() => newProfile('id', { ...input, status: 'verified' }, now));
  assert.throws(() => newProfile('id', { ...input, website: 'javascript:alert(1)' }, now));
});
test('standard requires identity/business evidence, contact details and distinct portfolio work', () => {
  const profile = complete(); assert.deepEqual(profileGaps(profile, now), []);
  profile.files[4].sha256 = profile.files[3].sha256;
  assert.ok(profileGaps(profile, now).includes('Three distinct portfolio images'));
  profile.files = []; assert.ok(profileGaps(profile, now).includes('Identity evidence'));
  profile.phone = '123'; assert.ok(profileGaps(profile, now).includes('Phone with international country code'));
});
test('review cannot be skipped, requires every check and records findings and expiry', () => {
  const profile = complete();
  assert.throws(() => reviewProfile(profile, { action: 'verify', checks: checked, reason: 'Test verification findings', validUntil: '2027-04-27' }, now), /Submit/);
  const submitted = reviewProfile(profile, { action: 'submit' }, now);
  assert.throws(() => reviewProfile(submitted, { action: 'verify', checks: blankChecks(), reason: 'Test verification findings', validUntil: '2027-04-27' }, now), /Every/);
  assert.throws(() => reviewProfile(submitted, { action: 'verify', checks: checked, reason: 'OK', validUntil: '2027-04-27' }, now), /findings/);
  const verified = reviewProfile(submitted, { action: 'verify', checks: checked, reason: 'Test verification findings only', validUntil: '2027-04-27' }, now);
  assert.equal(verified.status, 'verified'); assert.equal(verified.audit.at(-1).action, 'verified');
  assert.equal(effectiveProfileStatus(verified, '2027-04-28T10:00:00Z'), 'review_expired');
  const edited = editProfile(verified, input); assert.equal(edited.status, 'draft'); assert.equal(edited.verifiedUntil, ''); assert.deepEqual(edited.checks, blankChecks());
});
test('required licences need current evidence and bound the verification expiry', () => {
  const profile = complete(); profile.licenceRequired = true;
  assert.ok(profileGaps(profile, now).includes('Current licence evidence'));
  profile.licenceNumber = 'TEST'; profile.licenceIssuer = 'Test fixture issuer'; profile.licenceExpires = '2027-01-01';
  profile.files.push({ ...profile.files[0], kind: 'licence', expiresOn: '2027-01-01' });
  const submitted = reviewProfile(profile, { action: 'submit' }, now);
  assert.throws(() => reviewProfile(submitted, { action: 'verify', checks: checked, reason: 'Test findings on supplied evidence', validUntil: '2027-04-27' }, now), /licence expiry/);
  profile.licenceExpires = '2026-10-01'; assert.ok(profileGaps(profile, now).includes('Current licence expiry date'));
});
test('expired identity evidence cannot pass review; expiry dates must be real and current', () => {
  const profile = complete(); profile.files[0].expiresOn = '2026-09-01';
  assert.throws(() => reviewProfile(profile, { action: 'submit' }, now), /Current identity evidence/);
  const submitted = reviewProfile(complete(), { action: 'submit' }, now);
  for (const validUntil of ['2026-02-30', '2025-01-01', '2029-01-01']) assert.throws(() => reviewProfile(submitted, { action: 'verify', checks: checked, reason: 'Test review findings only', validUntil }, now), /expiry/);
});
test('claimed qualifications require current supporting evidence and expired reviews can be renewed', () => {
  const profile = complete(); profile.qualifications = 'QA qualification claim';
  assert.ok(profileGaps(profile, now).includes('Current evidence for stated qualifications'));
  profile.files.push({ ...profile.files[0], kind: 'qualification', expiresOn: '2025-01-01' });
  assert.ok(profileGaps(profile, now).includes('Current evidence for stated qualifications'));
  const submitted = reviewProfile(complete(), { action: 'submit' }, now);
  const verified = reviewProfile(submitted, { action: 'verify', checks: checked, reason: 'Test review findings only', validUntil: '2027-04-27' }, now);
  assert.equal(reviewProfile(verified, { action: 'submit' }, '2027-04-28T10:00:00Z').status, 'submitted');
});
test('revision/suspension need a reason and invalidate verification', () => {
  const submitted = reviewProfile(complete(), { action: 'submit' }, now);
  const verified = reviewProfile(submitted, { action: 'verify', checks: checked, reason: 'Test review findings only', validUntil: '2027-04-27' }, now);
  assert.throws(() => reviewProfile(verified, { action: 'suspend', reason: '' }, now), /reason/);
  assert.equal(reviewProfile(verified, { action: 'suspend', reason: 'Test suspension reason' }, now).status, 'suspended');
  assert.equal(reviewProfile(verified, { action: 'request_revision', reason: 'Refresh the test evidence' }, now).verifiedUntil, '');
});
test('file detection rejects active content and recognizes supported evidence formats', () => {
  assert.equal(detectProfileFile(Buffer.from('<svg onload="alert(1)">')), null);
  assert.equal(detectProfileFile(Buffer.from('<html>document.pdf</html>')), null);
  assert.equal(detectProfileFile(Buffer.from('%PDF-1.4\nfixture')), 'application/pdf');
  assert.equal(detectProfileFile(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'image/png');
});
test('audit history and version change on edits without allowing client-supplied audit fields', () => {
  const profile = complete(); const changed = recordChange(profile, {}, 'test', 'test reason', now);
  assert.equal(changed.version, profile.version + 1); assert.equal(changed.audit.at(-1).actor, 'owner');
  assert.throws(() => editProfile(profile, { ...input, audit: [] }));
});
