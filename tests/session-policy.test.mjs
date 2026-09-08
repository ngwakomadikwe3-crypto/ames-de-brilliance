import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionRole, sessionSecret, SESSION_MAX_AGE } from '../src/lib/session-policy.ts';
test('missing and default credentials fail closed', () => {
  for (const secret of [undefined, '', 'short', 'adb-session-secret-2026']) assert.equal(sessionSecret(secret), null);
  assert.equal(sessionSecret('x'.repeat(48)), 'x'.repeat(48));
});
test('sessions expire at eight hours and reject future or invalid timestamps', () => {
  const now = 100000000;
  assert.equal(sessionRole({ role: 'owner', ts: now - 1 }, now), 'owner');
  for (const ts of [now + 1, now - SESSION_MAX_AGE * 1000, NaN, Infinity, '123', undefined]) assert.equal(sessionRole({ role: 'owner', ts }, now), null);
});
test('payload cannot introduce a new privilege role', () => {
  for (const payload of [null, 'owner', {}, { role: 'admin', ts: Date.now() }, { role: {}, ts: Date.now() }]) assert.equal(sessionRole(payload), null);
});
