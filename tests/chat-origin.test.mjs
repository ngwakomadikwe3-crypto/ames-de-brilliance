import assert from 'node:assert/strict';
import test from 'node:test';
import { chatOriginAllowed } from '../src/lib/chat-origin.mjs';

const trusted = 'https://ames-de-brilliance.vercel.app';
const request = origin => new Request('http://localhost:3000/api/chat', {
  headers: origin === null ? {} : { origin },
});

test('chat accepts exact local origins only in development', () => {
  for (const mode of ['development', 'production', 'test', undefined]) {
    const env = { NODE_ENV: mode, AMES_APP_ORIGIN: trusted };
    assert.equal(chatOriginAllowed(request(trusted), env), true);
    for (const origin of ['http://localhost:3000', 'http://127.0.0.1:3000']) {
      assert.equal(chatOriginAllowed(request(origin), env), mode === 'development');
    }
    for (const origin of [null, 'null', 'https://untrusted.example', 'http://localhost:3001', 'http://localhost:3000.evil.example', 'https://localhost:3000']) {
      assert.equal(chatOriginAllowed(request(origin), env), false);
    }
  }
});

test('production requires configured origin and never trusts request URL', () => {
  for (const origin of [null, 'http://localhost:3000', trusted]) {
    assert.equal(chatOriginAllowed(request(origin), { NODE_ENV: 'production' }), false);
  }
  assert.equal(chatOriginAllowed(request('http://localhost:3000'), {
    NODE_ENV: 'production', AMES_APP_ORIGIN: 'http://localhost:3000',
  }), true);
});
