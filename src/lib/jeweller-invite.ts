import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** One-time studio invites for verified jewellers: a signed link bound to one profile and one email. */
const secret = () => {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new Error('Studio invites need SESSION_SECRET to be configured.');
  return value;
};
const sign = (payload: string) => createHmac('sha256', secret()).update(`jeweller-invite.${payload}`).digest();
const hashNonce = (nonce: Buffer) => createHash('sha256').update(nonce).digest('hex');
export type InviteRecord = { nonceHash: string; email: string; expires: string; sentAt: string };

export function createInvite(profileId: string, email: string, days = 7): { token: string; record: InviteRecord } {
  const nonce = randomBytes(18), expires = new Date(Date.now() + days * 86400000).toISOString();
  const payload = Buffer.from(JSON.stringify({ p: profileId, n: nonce.toString('base64url'), e: expires })).toString('base64url');
  return { token: `${payload}.${sign(payload).toString('base64url')}`, record: { nonceHash: hashNonce(nonce), email: email.trim().toLowerCase(), expires, sentAt: new Date().toISOString() } };
}
export function readInvite(token: unknown) {
  if (typeof token !== 'string' || token.length > 600) throw new Error('This invite link is not valid.');
  const [payload, signature] = token.split('.');
  if (!payload || !signature) throw new Error('This invite link is not valid.');
  const given = Buffer.from(signature, 'base64url'), expected = sign(payload);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new Error('This invite link is not valid.');
  const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { p: string; n: string; e: string };
  if (!/^[a-f0-9-]{36}$/.test(data.p) || !Date.parse(data.e)) throw new Error('This invite link is not valid.');
  if (Date.parse(data.e) < Date.now()) throw new Error('This invite has expired. Ask AMES to send a new one.');
  return { profileId: data.p, nonceHash: hashNonce(Buffer.from(data.n, 'base64url')), expires: data.e };
}
export const maskEmail = (email: string) => email.replace(/^(.)(.*)(@.*)$/, (_, a: string, b: string, c: string) => a + '•'.repeat(Math.min(6, b.length)) + c);
