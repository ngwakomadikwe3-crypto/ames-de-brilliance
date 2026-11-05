import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { resolve, join } from 'node:path';

test('CAD broker rejects missing/wrong credentials and reports offline without a worker', async () => {
  await mkdir('.ames-cad', { recursive: true });
  const root = await mkdtemp(join(resolve('.ames-cad'), 'broker-test-'));
  const token = 'a'.repeat(64);
  const child = spawn(process.execPath, ['scripts/cad/service.mjs'], { windowsHide: true, env: { ...process.env, AMES_CAD_ROOT: root, AMES_CAD_SERVICE_TOKEN: token, APPWRITE_ENDPOINT: 'https://example.test/v1', APPWRITE_PROJECT_ID: 'test', APPWRITE_API_KEY: 'test', PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    const port = await new Promise((resolvePort, reject) => {
      const timeout = setTimeout(() => reject(new Error('Broker startup timeout')), 30000);
      child.stdout.on('data', bytes => { const match = /loopback:(\d+)/.exec(bytes.toString()); if (match) { clearTimeout(timeout); resolvePort(Number(match[1])); } });
      child.once('error', error => { clearTimeout(timeout); reject(error); });
      child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Broker exited ${code}`)); });
    });
    const origin = `http://127.0.0.1:${port}`;
    assert.equal((await fetch(origin + '/health')).status, 401);
    assert.equal((await fetch(origin + '/health', { headers: { Authorization: `Bearer ${'b'.repeat(64)}` } })).status, 401);
    const headers = { Authorization: `Bearer ${token}` };
    assert.deepEqual(await (await fetch(origin + '/health', { headers })).json(), { online: false });
    assert.equal((await fetch(origin + '/products/test/jobs', { method: 'POST', headers, body: '{}' })).status, 503);
    assert.equal((await fetch(origin + '/private', { headers })).status, 404);
  } finally { child.kill(); }
});
