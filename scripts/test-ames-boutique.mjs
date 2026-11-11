import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { BOUTIQUE_CATEGORIES, defaultBoutiquePieces, boutiqueCategories, boutiqueByCategory, boutiqueGroups, boutiquePrice, loadBoutiqueContent } from '../src/lib/ames-boutique-content.ts';
import { loadChatStageContent } from '../src/lib/ames-chat-content.ts';
import { loadMediaContent, searchMedia } from '../src/lib/ames-media-content.ts';

const file = path => readFile(resolve('public/ames-engine', path), 'utf8').then(JSON.parse);
const mockFetch = async url => new Response(JSON.stringify(await file(String(url).replace('/ames-engine/', ''))));

test('loads the engine Boutique record without inventing price or approval', async () => {
  const pieces = await loadBoutiqueContent(mockFetch);
  const piece = pieces.find(item => item.assetId === 'demo-pave-solitaire');
  assert.ok(piece);
  assert.equal(piece.category, 'ring');
  assert.equal(piece.interactiveGlb, '/ames-engine/demo-pave-solitaire/web/solitaire-v3.glb');
  assert.equal(piece.revisionId, 'demo-pave-solitaire:1');
  assert.equal(piece.poster, '/ames-engine/demo-pave-solitaire/web/poster-v3.webp');
  assert.equal(piece.price, undefined);
  assert.equal(boutiquePrice(piece.price), null);
  assert.equal(piece.essentialSpecs.physicalScaleConfirmed, false);
  assert.equal(piece.publicationStatus, 'review');
  assert.equal(piece.visualApproval, 'pending');
});

test('the house Boutique shows one default piece per category and no development test packs', async () => {
  const pieces = await loadBoutiqueContent(mockFetch);
  const categories = pieces.map(piece => piece.category);
  assert.equal(new Set(categories).size, categories.length, 'one default piece per category');
  assert.ok(pieces.every(piece => !piece.assetId.startsWith('dev-test-')));
  const index = await file('boutique/index.json');
  assert.ok(index.contracts.every(path => !path.startsWith('dev-test-')));
  const ring = pieces.find(piece => piece.category === 'ring');
  const fixtures = [ring, { ...ring, assetId: 'second-ring' }, { ...ring, assetId: 'dev-test-watch', category: 'watch' }, { ...ring, assetId: 'bag', category: 'Accessories' }, { ...ring, assetId: 'box', category: 'accessory' }];
  assert.deepEqual(defaultBoutiquePieces(fixtures).map(piece => piece.assetId), [ring.assetId, 'bag']);
});

test('categories filter exactly and groups contain no more than four actual pieces', async () => {
  const pieces = await loadBoutiqueContent(mockFetch);
  const ring = pieces.find(piece => piece.category === 'ring');
  assert.deepEqual(BOUTIQUE_CATEGORIES.map(item => item.label), ['Rings', 'Earrings', 'Necklaces', 'Bracelets', 'Watches', 'Accessories']);
  assert.deepEqual(boutiqueByCategory(pieces, 'ring').map(piece => piece.assetId), ['demo-pave-solitaire']);
  assert.deepEqual(boutiqueByCategory(pieces, 'earrings').map(piece => piece.assetId), ['ames-pear-drop-earrings']);
  assert.deepEqual(boutiqueByCategory(pieces, 'pendant'), []);
  assert.deepEqual(boutiqueByCategory([ring], 'earrings'), []);
  assert.deepEqual(boutiqueCategories([...pieces, { ...ring, assetId: 'fixture-pendant', category: 'pendant' }]).map(item => item.label), ['Rings', 'Earrings', 'Necklaces', 'Bracelets', 'Watches', 'Accessories', 'Pendant']);
  assert.ok(pieces.every(piece => piece.price === undefined));
  assert.deepEqual(boutiqueGroups([ring]).map(group => group.length), [1]);
  const five = Array.from({ length: 5 }, (_, i) => ({ ...ring, assetId: `fixture-${i}` }));
  assert.deepEqual(boutiqueGroups(five).map(group => group.length), [4, 1]);
});

test('rejects a stale revision, unsafe path, and false publication approval', async () => {
  const index = await file('boutique/index.json');
  const original = await file(index.contracts[0]);
  const feed = changed => async url => new Response(JSON.stringify(String(url).endsWith('index.json') ? index : changed));
  await assert.rejects(loadBoutiqueContent(feed({ ...original, revisionId: 'stale' })));
  await assert.rejects(loadBoutiqueContent(feed({ ...original, poster: '../outside.png' })));
  await assert.rejects(loadBoutiqueContent(feed({ ...original, publicationStatus: 'published' })));
});

test('the development pendant stays out of the Boutique while its Chat and Media records keep one identity', async () => {
  const id = 'dev-test-pendant-001';
  const [pieces, chat, media, assetContract, boutiqueContract, mediaContract] = await Promise.all([
    loadBoutiqueContent(mockFetch), loadChatStageContent(id, mockFetch), loadMediaContent(mockFetch),
    file(`${id}/app/asset.json`), file(`${id}/app/boutique.json`), file(`${id}/app/media.json`),
  ]);
  assert.equal(pieces.find(item => item.assetId === id), undefined);
  assert.equal(boutiqueContract.revisionId, `${id}:1`);
  assert.equal(boutiqueContract.category, assetContract.category);
  assert.equal(boutiqueContract.name, assetContract.name);
  assert.equal(boutiqueContract.publicationStatus, 'review');
  assert.equal(boutiqueContract.visualApproval, 'pending');
  assert.equal(chat.contract.defaultView, 'front');
  assert.equal(chat.contract.assetId, id);
  assert.equal(chat.name, assetContract.name);
  assert.equal(chat.stageUrl, `/ames-engine/${id}/web/jewelry.glb`);
  assert.equal(chat.posterUrl, `/ames-engine/${id}/web/poster.png`);
  const posts = media.filter(record => record.assetId === id);
  assert.deepEqual(posts.map(record => record.id), mediaContract.items.map(item => item.id));
  assert.deepEqual(posts.map(record => record.mediaUrl), mediaContract.items.map(item => `/ames-engine/${id}/${item.path}`));
  assert.ok(posts.every(record => record.product.assetId === id && record.product.name === assetContract.name && record.approvalState === 'pending'));
  assert.deepEqual(searchMedia(media, 'pendant').map(record => record.key), posts.map(record => record.key));
  assert.equal(searchMedia(media, 'yellow gold').length, 0);
});
