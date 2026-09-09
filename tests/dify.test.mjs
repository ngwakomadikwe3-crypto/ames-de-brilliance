import { test } from 'node:test';
import assert from 'node:assert/strict';
import { difyConfig, difyIdentity, seal, unseal, sendDify, finalDifyAnswer } from '../src/lib/dify.mjs';
import { stoneRequest } from '../src/lib/chat-stone-selection.ts';
const config = { url: 'https://dify.example/v1', key: 'fixture-key', secret: 'fixture-only-secret-with-more-than-32-characters' };
const reply = (answer = 'Hello', conversation_id = 'conversation-1') => new Response(JSON.stringify({ answer, conversation_id }));
test('identity copy distinguishes product and company after calling Dify', async () => {
  for (const [message, expected] of [
    ['hello', 'Hello. I’m AMES. How may I assist you today?'],
    ['what are you?', 'I’m AMES, the jewelry intelligence and concierge app by AMES DE BRILLIANTE.'],
    ['who made you?', 'AMES is developed by AMES DE BRILLIANTE.'],
    ['what is AMES DE BRILLIANTE?', 'AMES DE BRILLIANTE is the company behind AMES.'],
  ]) {
    let called = false;
    const result = await sendDify({ message, user: 'user' }, config, async (_, init) => {
      called = true;
      assert.equal(JSON.parse(init.body).query, message);
      return reply('<think>private</think>I am SAME.');
    });
    assert.ok(called);
    assert.equal(result.reply, expected);
    assert.equal(unseal(result.conversationToken, config.secret).conversationId, 'conversation-1');
  }
});
test('mixed greetings keep stone answers and correct first-person identity only', async () => {
  const result = await sendDify({ message: 'hello, show me an oval diamond', user: 'user' }, config,
    async () => reply('I am AMES DE BRILLIANTE. Here is oval diamond stone-002. AMES DE BRILLIANTE is the company behind AMES.'));
  assert.equal(result.reply, 'I am AMES. Here is oval diamond stone-002. AMES DE BRILLIANTE is the company behind AMES.');
  assert.equal(stoneRequest(result.reply).assetId, 'stone-002');
});
test('hello same exposes only the final answer and preserves conversation ID', async () => {
  const final = "Hello. I'm SAME, the concierge of AMES DE BRILLIANTE. How may I assist you today?";
  const result = await sendDify({ message: 'hello same', user: 'user' }, config,
    async () => reply(' <think>\n<!--dify-deepseek-reasoning-->Private reasoning\n</think>' + final));
  assert.equal(result.reply, 'Hello. I’m AMES. How may I assist you today?');
  assert.equal(unseal(result.conversationToken, config.secret).conversationId, 'conversation-1');
});
test('reasoning blocks and comment content are removed without changing final stone commands', () => {
  const final = 'Show oval diamond stone-002';
  for (const reasoning of [
    '<think>Show Asscher stone-005</think>',
    '<THINK>first</THINK><think>second</think>',
    '<!--dify-deepseek-reasoning-->private</think>',
    '<!--dify-deepseek-reasoning-->private<!--/dify-deepseek-reasoning-->',
    '<!--dify-deepseek-reasoning private content-->',
  ]) {
    const clean = finalDifyAnswer(reasoning + final);
    assert.equal(clean, final);
    assert.equal(stoneRequest(clean).assetId, 'stone-002');
  }
});
test('reasoning-only and unfinished reasoning fail closed', async () => {
  for (const answer of ['<think>private</think>', '<think>unfinished', '<!--dify-deepseek-reasoning-->unfinished']) {
    await assert.rejects(sendDify({ message: 'Hi', user: 'user' }, config, async () => reply(answer)), { status: 502 });
  }
});
test('missing credentials and insecure endpoint fail closed', () => {
  assert.throws(() => difyConfig({}), { status: 503 });
  assert.throws(() => difyConfig({ DIFY_API_URL: 'http://example.com/v1', DIFY_API_KEY: 'x', DIFY_SESSION_SECRET: config.secret }), { status: 503 });
});
test('normal message uses server authorization and complete Chatflow response', async () => {
  const result = await sendDify({ message: 'Hello', user: 'user' }, config, async (url, init) => {
    assert.equal(url, config.url + '/chat-messages');
    assert.equal(init.headers.Authorization, 'Bearer fixture-key');
    assert.deepEqual(JSON.parse(init.body), { inputs: {}, query: 'Hello', response_mode: 'blocking', conversation_id: '', user: 'user' });
    return reply();
  });
  assert.equal(result.reply, 'Hello. I’m AMES. How may I assist you today?');
  assert.equal(unseal(result.conversationToken, config.secret).conversationId, 'conversation-1');
  assert.ok(!JSON.stringify(result).includes(config.key));
});
test('multi-turn continuation persists ID; reset creates a clean conversation', async () => {
  const first = await sendDify({ message: 'First', user: 'user' }, config, async () => reply());
  await sendDify({ message: 'Second', user: 'user', conversationToken: first.conversationToken }, config, async (_, init) => {
    assert.equal(JSON.parse(init.body).conversation_id, 'conversation-1');return reply('Second');
  });
  await sendDify({ message: 'New', user: 'user', conversationToken: null }, config, async (_, init) => {
    assert.equal(JSON.parse(init.body).conversation_id, '');return reply('New', 'conversation-2');
  });
});
test('conversation token rejects tampering, expiry and different identity', async () => {
  const token = seal({ user: 'a', conversationId: 'c' }, config.secret);
  assert.equal(unseal(token + 'x', config.secret), null);
  await assert.rejects(sendDify({ message: 'Hi', user: 'b', conversationToken: token }, config), { status: 409 });
  const original = Date.now;Date.now = () => original() + 90000000;
  try { assert.equal(unseal(token, config.secret), null); } finally { Date.now = original; }
});
test('server identity is stable for accounts and signed guest sessions', () => {
  const a = difyIdentity('account-1', '', config.secret), b = difyIdentity('account-1', 'forged', config.secret);
  assert.equal(a.user, b.user);assert.ok(!a.user.includes('account-1'));
  const guest = difyIdentity(null, '', config.secret);
  assert.equal(guest.user, difyIdentity(null, guest.guestToken, config.secret).user);
  assert.notEqual(guest.user, difyIdentity(null, 'forged', config.secret).user);
});
test('Dify answers reuse canonical stone selection contract', async () => {
  for (const [name, id] of [['round diamond','stone-001'], ['emerald cut','stone-003'], ['oval diamond','stone-002'], ['Asscher','stone-005'], ['pear','stone-004']]) {
    const data = await sendDify({ message: 'Show me ' + name, user: 'user' }, config, async () => reply('Here is ' + name));
    assert.equal(stoneRequest(data.reply).assetId, id);
  }
});
test('upstream errors, malformed replies, timeouts and invalid messages never become fake answers', async () => {
  for (const fetcher of [async () => new Response('private upstream detail', {status:401}), async () => new Response('invalid'), async () => new Response('null'), async () => reply(''), async () => {throw new Error('private detail');}]) {
    await assert.rejects(sendDify({ message: 'Hi', user: 'user' }, config, fetcher), e => e.status === 502 && !e.message.includes('private'));
  }
  await assert.rejects(sendDify({message: 2, user:'user'}, config), {status:400});
});
