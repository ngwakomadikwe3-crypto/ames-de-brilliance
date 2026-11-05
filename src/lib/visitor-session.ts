import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const VISITOR_COOKIE = 'ames_visitor';
export const VISITOR_AGE = 60 * 60 * 24 * 30;
function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new Error('Visitor session signing is unavailable');
  return value;
}
export function privateDigest(value: string) {
  return createHmac('sha256', secret()).update(`ames-visitor-v1:${value}`).digest('hex');
}
export function newVisitor(now = Date.now()) {
  const id = randomBytes(24).toString('hex');
  const payload = `${id}.${Math.floor(now / 1000) + VISITOR_AGE}`;
  return { id, token: `${payload}.${privateDigest(payload)}` };
}
export function verifyVisitor(token: string | undefined, now = Date.now()): string | null {
  if (!token || token.length > 150) return null;
  const match = /^([a-f0-9]{48})\.(\d{10})\.([a-f0-9]{64})$/.exec(token);
  if (!match) return null;
  const expiry = Number(match[2]);
  if (expiry <= now / 1000 || expiry > now / 1000 + VISITOR_AGE + 60) return null;
  const expected = Buffer.from(privateDigest(`${match[1]}.${match[2]}`), 'hex');
  return timingSafeEqual(expected, Buffer.from(match[3], 'hex')) ? match[1] : null;
}
