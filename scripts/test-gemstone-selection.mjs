import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import registry from '../src/lib/gemstone-registry.json' with { type: 'json' };
import { assetSelectionMessage, gemstoneRegistry, isGemstoneAssetId, parseAssetSelection, validatedAssetSelection } from '../src/lib/chat-asset-selection.ts';
import { loadChatStageContent } from '../src/lib/ames-chat-content.ts';

const fixtures = async path => JSON.parse(await readFile(resolve('public/ames-engine', path), 'utf8'));
const mockFetch = async url => new Response(JSON.stringify(await fixtures(String(url).replace('/ames-engine/', ''))), { status: 200 });

test('hidden library contains exactly 29 distinct indexed stone contracts with real GLBs and transparent posters', async () => {
  assert.equal(registry.length, 29);
  assert.equal(gemstoneRegistry.length, 29);
  assert.equal(new Set(registry.map(stone => stone.id)).size, 29);
  const index = await fixtures('chat/index.json');
  assert.equal(index.contracts.filter(path => path.startsWith('stone-')).length, 29);
  for (const stone of registry) {
    assert.ok(isGemstoneAssetId(stone.id));
    const content = await loadChatStageContent(stone.id, mockFetch);
    assert.equal(content.name, stone.name);
    assert.equal(content.category, stone.category);
    assert.equal(content.contract.type, 'gemstone');
    assert.equal(content.contract.revisionId, `${stone.id}:${stone.id === 'stone-moonstone' ? 3 : stone.form.startsWith('faceted') ? 4 : 2}`);
    assert.equal(content.contract.stageAsset, stone.id === 'stone-moonstone' ? 'web/jewelry-v3.glb' : 'web/jewelry.glb');
    assert.deepEqual(content.contract.supportedViewerActions, ['rotate', 'stop_rotation', 'zoom', 'reset', 'side_view']);
    assert.ok(content.limitations.length >= 3);
    const glb = await readFile(resolve('public', content.stageUrl.slice(1)));
    assert.equal(glb.subarray(0, 4).toString(), 'glTF');
    assert.ok(glb.length > 1000);
    const poster = await readFile(resolve('public', content.posterUrl.slice(1)));
    assert.equal(poster.subarray(8, 12).toString(), 'WEBP');
    assert.ok((await stat(resolve('public', content.stageUrl.slice(1)))).size > 1000);
  }
  const boutique = JSON.parse(await readFile(resolve('public/ames-engine/boutique/index.json'), 'utf8'));
  assert.ok(!JSON.stringify(boutique).includes('stone-'), 'stones remain hidden from Boutique');
});

test('every canonical name and useful alias selects its own stone at case-insensitive word boundaries', () => {
  for (const stone of registry) {
    for (const phrase of [stone.name, ...stone.aliases]) {
      for (const query of [`Show me ${phrase}`, `I WANT TO SEE ${phrase.toUpperCase()}`, `What does ${phrase} look like?`]) {
        assert.deepEqual(parseAssetSelection(query, 'dev-test-candidate-ring'), { kind: 'select', assetId: stone.id, name: stone.name }, query);
      }
      assert.equal(parseAssetSelection(`pre${phrase}post`, 'dev-test-candidate-ring').kind, 'none');
    }
  }
});

test('required examples, defaults, multiword names, and ring restoration work', () => {
  const examples = [
    ['Show me a ruby', 'stone-ruby'], ['I want to see emerald', 'stone-emerald'],
    ['What does tanzanite look like?', 'stone-tanzanite'], ['Show me a blue sapphire', 'stone-sapphire'],
    ['Show me a fancy yellow diamond', 'stone-fancy-color-diamond'], ['show me lapis lazuli', 'stone-lapis-lazuli'],
    ['show me rose quartz', 'stone-rose-quartz'], ['show me a loose diamond', 'stone-diamond'],
  ];
  for (const [query, assetId] of examples) assert.equal(parseAssetSelection(query, 'dev-test-candidate-ring').assetId, assetId);
  assert.equal(parseAssetSelection('show the ring again', 'stone-ruby').assetId, 'demo-pave-solitaire');
});

test('negation, colour-only text, product constituent questions, and follow-ups do not switch', () => {
  for (const query of ['not ruby', 'no emerald please', 'show me anything but sapphire', 'I like blue', 'show me a red ring', 'tell me more', 'zoom in', 'rotate it', 'show the side']) {
    assert.equal(parseAssetSelection(query, 'dev-test-candidate-ring').kind, 'none', query);
  }
  for (const query of ['show me the diamond in this ring', 'tell me about the emerald in the setting', 'show the ruby on this jewelry']) {
    assert.equal(parseAssetSelection(query, 'dev-test-candidate-ring').kind, 'none', query);
  }
  assert.equal(parseAssetSelection('show me a loose diamond', 'dev-test-candidate-ring').assetId, 'stone-diamond');
});

test('multiple stones ask which to display first and unsupported colours never silently substitute', () => {
  const multiple = parseAssetSelection('compare ruby and sapphire', 'stone-emerald');
  assert.equal(multiple.kind, 'multiple');
  assert.equal(multiple.matches.length, 2);
  assert.match(assetSelectionMessage(multiple), /which.*display first/i);
  for (const query of ['show me a red emerald', 'show me a green sapphire', 'show me a purple ruby']) {
    const intent = parseAssetSelection(query, 'stone-diamond');
    assert.equal(intent.kind, 'unsupported_color', query);
    assert.match(assetSelectionMessage(intent), /haven’t substituted/);
  }
  assert.equal(parseAssetSelection('show me a blue sapphire', 'stone-diamond').kind, 'select');
  assert.equal(parseAssetSelection('show me a fancy yellow diamond', 'stone-diamond').kind, 'select');
});

test('API selection validator rejects unsupported and traversal IDs', () => {
  for (const stone of registry) assert.deepEqual(validatedAssetSelection({ assetId: stone.id }), { assetId: stone.id });
  assert.deepEqual(validatedAssetSelection('dev-test-candidate-ring'), { assetId: 'dev-test-candidate-ring' });
  for (const value of ['stone-missing', '../private', '/stone-ruby', '', null, undefined, 3, { assetId: '../private' }, { assetId: 'dev-test-earring-001' }]) {
    assert.equal(validatedAssetSelection(value), null);
  }
});
