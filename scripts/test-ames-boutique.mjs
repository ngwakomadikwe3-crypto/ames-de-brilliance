import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { BOUTIQUE_CATEGORIES, boutiqueCategories, boutiqueByCategory, boutiqueGroups, boutiquePrice, loadBoutiqueContent } from '../src/lib/ames-boutique-content.ts';
import { loadChatStageContent } from '../src/lib/ames-chat-content.ts';
import { loadMediaContent, searchMedia } from '../src/lib/ames-media-content.ts';

const file = path => readFile(resolve('public/ames-engine', path), 'utf8').then(JSON.parse);
const mockFetch = async url => new Response(JSON.stringify(await file(String(url).replace('/ames-engine/', ''))));

test('loads the engine Boutique record without inventing price or approval', async () => {
  const pieces = await loadBoutiqueContent(mockFetch);
  assert.equal(pieces.length, 4);
  const piece = pieces[0];
  assert.equal(piece.assetId, 'dev-test-candidate-ring');
  assert.equal(piece.category, 'ring');
  assert.equal(piece.interactiveGlb, '/ames-engine/dev-test-candidate-ring/web/jewelry.glb');
  assert.equal(piece.poster, '/ames-engine/dev-test-candidate-ring/web/poster.png');
  assert.equal(piece.price, undefined);
  assert.equal(boutiquePrice(piece.price), null);
  assert.equal(piece.essentialSpecs.physicalScaleConfirmed, false);
  assert.equal(piece.publicationStatus, 'review');
  assert.equal(piece.visualApproval, 'pending');
});

test('categories filter exactly and groups contain no more than four actual pieces', async () => {
  const pieces = await loadBoutiqueContent(mockFetch);
  const [ring] = pieces;
  assert.deepEqual(BOUTIQUE_CATEGORIES.map(item => item.label), ['Rings', 'Earrings', 'Necklaces', 'Bracelets', 'Diamonds']);
  assert.deepEqual(boutiqueByCategory([ring], 'ring'), [ring]);
  assert.deepEqual(boutiqueByCategory(pieces, 'ring').map(piece => piece.assetId), ['dev-test-candidate-ring', 'dev-test-solitaire-mount']);
  assert.deepEqual(boutiqueByCategory(pieces, 'earrings').map(piece => piece.assetId), ['dev-test-earring-001']);
  assert.deepEqual(boutiqueByCategory(pieces, 'pendant').map(piece => piece.assetId), ['dev-test-pendant-001']);
  assert.deepEqual(boutiqueByCategory([ring], 'earrings'), []);
  assert.deepEqual(boutiqueCategories(pieces).map(item => item.label), ['Rings', 'Earrings', 'Necklaces', 'Bracelets', 'Diamonds', 'Pendant']);
  assert.equal(pieces.find(piece => piece.category === 'earrings').price, undefined);
  assert.equal(pieces.find(piece => piece.category === 'pendant').price, undefined);
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

test('fourth asset preserves one pendant identity across Boutique, Chat, and supplied Media', async () => {
  const id = 'dev-test-pendant-001';
  const [pieces, chat, media, assetContract, mediaContract] = await Promise.all([
    loadBoutiqueContent(mockFetch), loadChatStageContent(id, mockFetch), loadMediaContent(mockFetch),
    file(`${id}/app/asset.json`), file(`${id}/app/media.json`),
  ]);
  const piece = pieces.find(item => item.assetId === id);
  assert.ok(piece);
  assert.equal(piece.revisionId, `${id}:1`);
  assert.equal(piece.category, assetContract.category);
  assert.equal(piece.name, assetContract.name);
  assert.equal(piece.interactiveGlb, `/ames-engine/${id}/web/jewelry.glb`);
  assert.equal(piece.poster, `/ames-engine/${id}/web/poster.png`);
  assert.equal(piece.price, undefined);
  assert.equal(piece.publicationStatus, 'review');
  assert.equal(piece.visualApproval, 'pending');
  assert.equal(chat.contract.defaultView, 'front');
  assert.equal(chat.contract.assetId, piece.assetId);
  assert.equal(chat.name, piece.name);
  assert.equal(chat.stageUrl, piece.interactiveGlb);
  assert.equal(chat.posterUrl, piece.poster);
  const posts = media.filter(record => record.assetId === id);
  assert.deepEqual(posts.map(record => record.id), mediaContract.items.map(item => item.id));
  assert.deepEqual(posts.map(record => record.mediaUrl), mediaContract.items.map(item => `/ames-engine/${id}/${item.path}`));
  assert.ok(posts.every(record => record.product.assetId === piece.assetId && record.product.name === piece.name && record.approvalState === 'pending'));
  assert.deepEqual(searchMedia(media, 'pendant').map(record => record.key), posts.map(record => record.key));
  assert.equal(searchMedia(media, 'yellow gold').length, 0);
});
