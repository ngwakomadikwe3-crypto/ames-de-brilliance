import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

const fail = (status, message) => Object.assign(new Error(message), { status });
export function difyConfig(env = process.env) {
  if (!env.DIFY_API_URL || !env.DIFY_API_KEY || !env.DIFY_SESSION_SECRET || env.DIFY_SESSION_SECRET.length < 32)
    throw fail(503, 'AMES chat is not configured yet.');
  const url = new URL(env.DIFY_API_URL);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw fail(503, 'AMES chat configuration is unavailable.');
  return { url: url.href.replace(/\/$/, ''), key: env.DIFY_API_KEY, secret: env.DIFY_SESSION_SECRET };
}
export function seal(data, secret) {
  const payload = Buffer.from(JSON.stringify({ ...data, expires: Date.now() + 86400000 })).toString('base64url');
  return payload + '.' + createHmac('sha256', secret).update(payload).digest('base64url');
}
export function unseal(token, secret) {
  try {
    if (typeof token !== 'string' || token.length > 4096) return null;
    const [payload, signature, extra] = token.split('.');
    if (extra || !signature) return null;
    const expected = createHmac('sha256', secret).update(payload).digest();
    const actual = Buffer.from(signature, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return data.expires > Date.now() ? data : null;
  } catch { return null; }
}
export function difyIdentity(accountId, guestToken, secret) {
  const guest = unseal(guestToken, secret);
  const id = accountId ? 'account:' + accountId : 'guest:' + (guest?.guestId || randomUUID());
  return { user: createHmac('sha256', secret).update(id).digest('hex'), guestToken: accountId ? null : seal({ guestId: id.slice(6) }, secret) };
}
export function finalDifyAnswer(answer) {
  return answer
    // Discard unfinished reasoning too, rather than exposing a partial thought.
    .replace(/<think\b[^>]*>[\s\S]*?(?:<\/think\s*>|$)/gi, '')
    .replace(/<!--\s*dify-deepseek-reasoning\s*-->[\s\S]*?(?:<\/think\s*>|<!--\s*\/?dify-deepseek-reasoning\s*-->|$)/gi, '')
    .replace(/<!--[^]*?-->/g, '')
    .replace(/<\/?think\b[^>]*>/gi, '')
    .trim();
}
export function amesIdentityCopy(message, answer) {
  // Apply product copy only after a successful, filtered Dify response.
  // Whole-message matches leave mixed requests and stone instructions intact.
  const question = message.trim().toLowerCase().replace(/[.!?]+$/, '').trim();
  if (/^(?:hello|hi|hey)(?:[, ]+(?:ames|same))?$/.test(question))
    return 'Hello. I’m AMES. How may I assist you today?';
  if (/^(?:what|who) are you$/.test(question))
    return 'I’m AMES, the jewelry intelligence and concierge app by AMES DE BRILLIANTE.';
  if (/^who (?:made|created|developed) you$/.test(question))
    return 'AMES is developed by AMES DE BRILLIANTE.';
  if (question === 'what is ames de brilliante')
    return 'AMES DE BRILLIANTE is the company behind AMES.';
  return answer.replace(/\b(I am|I['’]m|my name is)\s+(?:SAME|AMES DE BRILLIANTE)\b/gi, '$1 AMES');
}
export async function sendDify({ message, conversationToken, user }, config, fetcher = fetch) {
  if (typeof message !== 'string' || !message.trim() || message.length > 8000) throw fail(400, 'Enter a message of up to 8000 characters.');
  const previous = conversationToken ? unseal(conversationToken, config.secret) : null;
  if (conversationToken && (!previous || previous.user !== user || typeof previous.conversationId !== 'string'))
    throw fail(409, 'This conversation has expired. Start a new conversation.');
  let response;
  try {
    response = await fetcher(config.url + '/chat-messages', {
      method: 'POST', headers: { Authorization: 'Bearer ' + config.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputs: {}, query: message.trim(), response_mode: 'blocking', conversation_id: previous?.conversationId || '', user }),
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(90000),
    });
  } catch { throw fail(502, 'AMES chat could not connect. Please try again.'); }
  if (!response.ok) throw fail(response.status === 404 && previous ? 409 : 502, response.status === 404 && previous ? 'This conversation is unavailable. Start a new conversation.' : 'AMES chat is temporarily unavailable. Please try again.');
  let data;
  try { data = await response.json(); } catch { throw fail(502, 'AMES chat returned an incomplete response. Please try again.'); }
  if (!data || typeof data !== 'object' || typeof data.answer !== 'string' || !data.answer.trim() || typeof data.conversation_id !== 'string' || !data.conversation_id || data.event === 'workflow_paused')
    throw fail(502, 'AMES chat returned an incomplete response. Please try again.');
  const reply = finalDifyAnswer(data.answer);
  if (!reply) throw fail(502, 'AMES chat returned an incomplete response. Please try again.');
  return { reply: amesIdentityCopy(message, reply), conversationToken: seal({ user, conversationId: data.conversation_id }, config.secret) };
}
