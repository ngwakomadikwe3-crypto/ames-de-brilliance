import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadChatStageContent, supportedViewerAction } from '../src/lib/ames-chat-content.ts';
import { actionFromSameResponse, parseViewerIntent } from '../src/lib/chat-viewer-actions.ts';
import { createTurntable, turntableEnabled, turntablePointerDown, turntablePointerUp, turntableReady, turntableReset, turntableTick, RESUME_DELAY_MS } from '../src/lib/chat-turntable.ts';

const publicRoot = resolve('public');
const fixtures = async path => JSON.parse(await readFile(resolve(publicRoot, 'ames-engine', path), 'utf8'));
const mockFetch = async url => {
  const path = String(url).replace('/ames-engine/', '');
  return new Response(JSON.stringify(await fixtures(path)), { status: 200 });
};

test('Chat adapter loads the current contract and resolves stage assets', async () => {
  const content = await loadChatStageContent(undefined, mockFetch);
  assert.equal(content.contract.type, 'jewelry');
  assert.equal(content.contract.presentation, 'interactive');
  assert.equal(content.stageUrl, '/ames-engine/demo-pave-solitaire/web/solitaire-v1.glb');
  assert.equal(content.posterUrl, '/ames-engine/demo-pave-solitaire/web/poster-v1.webp');
  assert.equal(content.contract.rotationEnabled, false);
  assert.equal(content.contract.defaultView, 'three_quarter');
  assert.equal(content.contract.essentialSpecs.physicalScaleConfirmed, false);
  assert.equal(content.commerciallyApproved, false);
  assert.ok(content.limitations.some(item => item.includes('hidden geometry is inferred')));
  assert.equal(supportedViewerAction('rotate', content.contract), 'rotate');
  assert.equal(supportedViewerAction('invented_action', content.contract), null);
});

test('Chat selects each asset by exact ID with its own revision, name, and stage', async () => {
  for (const id of ['dev-test-candidate-ring', 'dev-test-solitaire-mount', 'dev-test-earring-001', 'dev-test-pendant-001']) {
    const content = await loadChatStageContent(id, mockFetch);
    assert.equal(content.contract.assetId, id);
    assert.equal(content.stageUrl, `/ames-engine/${id}/web/jewelry.glb`);
    assert.equal(content.posterUrl, `/ames-engine/${id}/web/${id === 'dev-test-candidate-ring' ? 'presentation-ring-studio.webp' : 'poster.png'}`);
    assert.equal(content.contract.revisionId, `${id}:${id === 'dev-test-candidate-ring' ? '3' : '1'}`);
    assert.equal(content.commerciallyApproved, false);
    assert.ok(content.name);
  }
  const earring = await loadChatStageContent('dev-test-earring-001', mockFetch);
  assert.equal(earring.category, 'earrings');
  assert.equal(earring.contract.defaultView, 'three_quarter');
  const pendant = await loadChatStageContent('dev-test-pendant-001', mockFetch);
  assert.equal(pendant.category, 'pendant');
  assert.equal(pendant.contract.defaultView, 'front');
  await assert.rejects(loadChatStageContent('missing-asset', mockFetch));
});

test('Chat adapter rejects stale revisions and false publication approval', async () => {
  const chat = await fixtures('dev-test-candidate-ring/app/chat.json');
  const asset = await fixtures('dev-test-candidate-ring/app/asset.json');
  const index = await fixtures('chat/index.json');
  const responses = (changedChat, changedAsset) => async url => new Response(JSON.stringify(String(url).endsWith('index.json') ? index : String(url).endsWith('chat.json') ? changedChat : changedAsset));
  await assert.rejects(loadChatStageContent('dev-test-candidate-ring', responses({ ...chat, revisionId: 'stale' }, asset)));
  await assert.rejects(loadChatStageContent('dev-test-candidate-ring', responses({ ...chat, publicationStatus: 'published' }, { ...asset, publicationStatus: 'published' })));
});

test('SAME viewer intents stay typed and contract bounded', async () => {
  const { contract } = await loadChatStageContent('dev-test-candidate-ring', mockFetch);
  const examples = [
    ['Show me the side', 'side_view'],
    ['Let me see the setting', 'inspect_setting'],
    ['Show me the diamond closer', 'macro_view'],
    ['Spin it', 'rotate'],
    ['Stop', 'stop_rotation'],
    ['Reset', 'reset'],
  ];
  for (const [text, action] of examples) {
    assert.equal(parseViewerIntent(text), action);
    assert.equal(actionFromSameResponse(text, null, contract.supportedViewerActions), action);
  }
  assert.equal(actionFromSameResponse('Tell me about the ring', 'invented_action', contract.supportedViewerActions), null);
  assert.equal(actionFromSameResponse('Show me the side', null, ['rotate']), null);
  assert.equal(actionFromSameResponse('Tell me about the ring', 'macro_view', contract.supportedViewerActions), 'macro_view');
});

test('turntable waits for GLB, pauses for manual orbit, resumes gently, and obeys stop/rotate/reset', () => {
  let state = createTurntable(true);
  state = turntableTick(state, 1000);
  assert.equal(state.angleDeg, 0, 'poster/loading state must not rotate');
  state = turntableReady(state, 1000);
  state = turntableTick(state, 1050);
  assert.ok(state.angleDeg > 0, 'loaded jewelry rotates');
  const beforeDrag = state.angleDeg;
  state = turntablePointerDown(state, 1100);
  state = turntableTick(state, 1150);
  assert.equal(state.angleDeg, beforeDrag, 'manual orbit pauses immediately');
  state = turntablePointerUp(state, 1200);
  state = turntableTick(state, 1200 + RESUME_DELAY_MS - 50);
  assert.equal(state.angleDeg, beforeDrag, 'resume delay holds the piece still');
  state = turntableTick(state, 1200 + RESUME_DELAY_MS + 50);
  assert.ok(state.angleDeg > beforeDrag, 'turntable resumes after interaction');
  const afterResume = state.angleDeg;
  state = turntableEnabled(state, false, 3200);
  state = turntableTick(state, 3250);
  assert.equal(state.angleDeg, afterResume, 'stop_rotation freezes orientation');
  state = turntableEnabled(state, true, 3300);
  state = turntableTick(state, 3350);
  assert.ok(state.angleDeg > afterResume, 'rotate re-enables motion');
  state = turntableReset(state, 3400);
  assert.equal(state.angleDeg, 0, 'reset returns to the default presentation');
});

// Exercise the actual route with filesystem fixtures and a mocked SAME response.
async function amesRoute({ remote = {}, editContract } = {}) {
  const { default: ts } = await import('typescript');
  const { default: vm } = await import('node:vm');
  const content = await import('../src/lib/ames-chat-content.ts');
  const actions = await import('../src/lib/chat-viewer-actions.ts');
  const paths = await import('node:path');
  const calls = { files: [], remote: 0, remoteInputs: [] };
  const dependencies = {
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
    'node:fs/promises': { readFile: async (path, encoding) => {
      calls.files.push(path);
      const body = await readFile(path, encoding);
      if (editContract && path.endsWith(`${paths.sep}app${paths.sep}chat.json`)) return JSON.stringify(editContract(JSON.parse(body)));
      return body;
    } },
    'node:path': paths,
    '@/lib/ames-chat-content': content,
    '@/lib/chat-viewer-actions': actions,
    '@/lib/chat-asset-selection': await import('../src/lib/chat-asset-selection.ts'),
    '@/lib/same-answer': await import('../src/lib/same-answer.ts'),
    '@/lib/chat-security': { checkChatOrigin() {}, requireVisitor() { return 'test-owner'; }, readChatJson: req => req.json(), ownedChat: async () => ({ owner: 'test-owner', chat: { provider_id: '' } }), consumeQuota: async () => {}, privateHeaders: {}, chatFailure: error => { throw error; }, ChatError: class extends Error {} },
    '@/lib/appwrite': { DB_ID: 'test', nowISO: () => new Date().toISOString(), doc: value => value, getDb: () => ({ createDocument: async ({ data }) => data, updateDocument: async () => ({}) }) },
    'node-appwrite': { ID: { unique: () => 'test-message' } },
  };
  const source = await readFile(new URL('../src/app/api/ames/route.ts', import.meta.url), 'utf8');
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, require: name => { assert.ok(name in dependencies, name); return dependencies[name]; }, Response, AbortSignal,
    process: { cwd: () => process.cwd(), env: { DIFY_API_KEY: 'test-only' } },
    fetch: async (_url, init) => { calls.remote++; calls.remoteInputs.push(JSON.parse(init.body)); return Response.json(remote); },
  });
  return { post: body => exports.POST({ json: async () => ({ chatId: "test-chat", ...body }) }), calls };
}

test('API resolves the selected indexed Chat contract and permits Spin it', async () => {
  for (const assetId of ['dev-test-candidate-ring', 'dev-test-earring-001', 'dev-test-pendant-001']) {
    const { post, calls } = await amesRoute();
    const response = await post({ query: 'Spin it', assetId });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).viewer_action, 'rotate');
    assert.ok(calls.files.some(path => path === resolve(publicRoot, 'ames-engine', assetId, 'app/chat.json')));
    assert.equal(calls.files.filter(path => path.endsWith('chat.json')).length, 1);
  }
});

test('API sends the requested gemstone context to SAME and rejects a conflicting model selection', async () => {
  const { post, calls } = await amesRoute({ remote: { answer: 'Ruby preview', asset_selection: { assetId: 'stone-emerald' } } });
  const response = await post({ query: 'Show me a ruby', assetId: 'dev-test-candidate-ring' });
  assert.equal(response.status, 200);
  assert.equal(calls.remoteInputs[0].inputs.ames_asset_id, 'stone-ruby');
  assert.equal((await response.json()).asset_selection.assetId, 'stone-ruby');
});

test('API preserves gemstone context for follow-ups and ignores unregistered model selections', async () => {
  const { post, calls } = await amesRoute({ remote: { answer: 'More information', asset_selection: { assetId: '../private' } } });
  const response = await post({ query: 'tell me more', assetId: 'stone-sapphire' });
  assert.equal(response.status, 200);
  assert.equal(calls.remoteInputs[0].inputs.ames_asset_id, 'stone-sapphire');
  assert.equal((await response.json()).asset_selection, undefined);
});

test('API returns customer text without provider reasoning or raw metadata', async () => {
  const { post } = await amesRoute({ remote: { answer: '<think>private</think>Hello', conversation_id: 'conversation', metadata: { reasoning: 'private' } } });
  const response = await post({ query: 'Hello' });
  const payload = await response.json();
  assert.equal(payload.answer, 'Hello');
  assert.equal(payload.message.text, 'Hello');
  assert.equal(payload.conversation_id, undefined);
  assert.equal(payload.metadata, undefined);
});

test('API rejects unindexed and traversal IDs before any contract or remote request', async () => {
  for (const assetId of ['../private', 'missing-asset', '', '/dev-test-candidate-ring', { id: 'dev-test-candidate-ring' }]) {
    const { post, calls } = await amesRoute();
    assert.equal((await post({ query: 'Spin it', assetId })).status, 400);
    assert.equal(calls.remote, 0);
    assert.ok(calls.files.every(path => path.endsWith('index.json')));
  }
});

test('API uses selected contract permissions, and preserves default selection', async () => {
  const restricted = await amesRoute({ editContract: contract => ({ ...contract, supportedViewerActions: ['reset'] }) });
  assert.equal((await (await restricted.post({ query: 'Spin it', assetId: 'dev-test-earring-001' })).json()).viewer_action, undefined);
  const fallback = await amesRoute();
  assert.equal((await (await fallback.post({ query: 'Spin it', assetId: null })).json()).viewer_action, 'rotate');
});

test('solitaire Chat and Boutique resolve the same GLB and poster', async () => {
  const { loadBoutiqueContent } = await import('../src/lib/ames-boutique-content.ts');
  const chat = await loadChatStageContent('demo-pave-solitaire', mockFetch);
  const piece = (await loadBoutiqueContent(mockFetch)).find(piece => piece.assetId === chat.contract.assetId);
  assert.equal(chat.contract.revisionId, 'demo-pave-solitaire:1');
  assert.equal(piece.revisionId, chat.contract.revisionId);
  assert.equal(piece.interactiveGlb, chat.stageUrl);
  assert.ok(piece.poster.endsWith('/web/poster-v1.webp'));
  assert.equal(piece.poster, chat.posterUrl);
  assert.ok(chat.posterUrl.endsWith('/web/poster-v1.webp'));
});

test('API default context matches the interactive solitaire and can explicitly restore the concept diamond', async () => {
  const {post,calls}=await amesRoute();
  assert.equal((await post({query:'Tell me about this object'})).status,200);
  assert.equal(calls.remoteInputs[0].inputs.ames_asset_id,'demo-pave-solitaire');
  const response=await post({query:'Show the default diamond',assetId:'stone-ruby'});
  assert.equal((await response.json()).asset_selection.assetId,'demo-modern-diamond');
  assert.equal(calls.remoteInputs[1].inputs.ames_asset_id,'demo-modern-diamond');
});
