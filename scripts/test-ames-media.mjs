import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadMediaContent, searchMedia, isMediaReview } from '../src/lib/ames-media-content.ts';
import { localMediaInteractionStore } from '../src/lib/ames-media-interactions.ts';

const root = new URL('../public/ames-engine/', import.meta.url);
const fetcher = async url => {
  try { return { ok: true, json: async () => JSON.parse(await readFile(new URL(url.replace('/ames-engine/', ''), root), 'utf8')) }; }
  catch { return { ok: false }; }
};

test('engine items keep exact asset identity and approval state', async () => {
  const records = await loadMediaContent(fetcher);
  assert.equal(records.length, 21);
  assert.deepEqual([...new Set(records.map(record => record.assetId))], ['dev-test-candidate-ring', 'dev-test-solitaire-mount', 'dev-test-earring-001', 'dev-test-pendant-001']);
  assert.ok(records.every(record => record.product.assetId === record.assetId));
  assert.ok(records.every(isMediaReview));
  assert.equal(records.filter(record => record.mediaType === 'video').length, 8);
  assert.equal(records[0].poster, '/ames-engine/dev-test-candidate-ring/web/poster.png');
});

test('search uses supplied name and category without invented metal or shape', async () => {
  const records = await loadMediaContent(fetcher);
  assert.equal(searchMedia(records, 'solitaire ring').length, 10);
  assert.equal(searchMedia(records, 'ring').length, 10);
  assert.equal(searchMedia(records, 'earrings').length, 6);
  assert.ok(searchMedia(records, 'earrings').every(record => record.product.assetId === 'dev-test-earring-001'));
  assert.equal(searchMedia(records, 'pendant').length, 5);
  assert.ok(searchMedia(records, 'pendant').every(record => record.product.assetId === 'dev-test-pendant-001'));
  assert.equal(searchMedia(records, 'yellow gold').length, 0);
  assert.equal(searchMedia(records, 'round diamond').length, 0);
});

test('local interaction boundary persists toggles and comments', () => {
  const values = new Map();
  globalThis.window = { localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) } };
  const key = 'asset:media';
  assert.deepEqual(localMediaInteractionStore.read(key), { liked: false, saved: false, comments: [] });
  const next = { liked: true, saved: true, comments: [{ id: 'one', text: 'Beautiful', createdAt: '2026-09-22T00:00:00Z' }] };
  localMediaInteractionStore.write(key, next);
  assert.deepEqual(localMediaInteractionStore.read(key), next);
  delete globalThis.window;
});
