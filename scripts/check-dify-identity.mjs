import assert from 'node:assert/strict';
import { unseal } from '../src/lib/dify.mjs';
let conversationToken, cookie, conversationId;
const expected = {
  hello: 'Hello. I’m AMES. How may I assist you today?',
  'what are you?': 'I’m AMES, the jewelry intelligence and concierge app by AMES DE BRILLIANTE.',
  'who made you?': 'AMES is developed by AMES DE BRILLIANTE.',
  'what is AMES DE BRILLIANTE?': 'AMES DE BRILLIANTE is the company behind AMES.',
};
for (const message of ['hello', 'what are you?', 'who made you?', 'show me an oval diamond', 'what is AMES DE BRILLIANTE?']) {
  const response = await fetch('http://localhost:3000/api/chat', {
    method: 'POST', headers: { origin: 'http://localhost:3000', 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify({ message, conversationToken }),
  });
  const body = await response.json();
  const cookies = response.headers.getSetCookie();
  if (cookies.length) cookie = cookies.map(c => c.split(';')[0]).join('; ');
  const id = unseal(body.conversationToken, process.env.DIFY_SESSION_SECRET)?.conversationId;
  const continuity = !!id && (!conversationId || conversationId === id);
  console.log(JSON.stringify({ message, status: response.status, reply: body.reply, error: body.error, stone: body.stone, continuity, reasoningVisible: /<\/?think|dify-deepseek-reasoning/i.test(body.reply || '') }));
  assert.equal(response.status, 200);
  assert.ok(continuity);
  assert.doesNotMatch(body.reply, /<\/?think|dify-deepseek-reasoning/i);
  if (expected[message]) assert.equal(body.reply, expected[message]);
  if (message.includes('oval')) assert.equal(body.stone?.assetId, 'stone-002');
  conversationId = id; conversationToken = body.conversationToken;
}
