import { randomBytes, timingSafeEqual } from 'node:crypto';
export const socialProviders = ['google', 'tiktok'] as const;
export type SocialProvider = typeof socialProviders[number];
export const SOCIAL_COOKIE = 'ames_social_login';
export const SOCIAL_AGE = 600;
export function enabledSocialProviders(): SocialProvider[] {
  const configured = (process.env.AMES_SOCIAL_PROVIDERS || '').split(',').map(v => v.trim());
  return socialProviders.filter(v => configured.includes(v));
}
export function socialOrigin(requestUrl: string) {
  const request = new URL(requestUrl);
  const origin = process.env.AMES_AUTH_ORIGIN || (process.env.NODE_ENV === 'production' ? 'https://houseofames.com' : request.origin);
  const configured = new URL(origin);
  if (configured.origin !== origin || configured.username || configured.password || request.origin !== origin ||
    (configured.protocol !== 'https:' && !(configured.protocol === 'http:' && process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1'].includes(configured.hostname)))) throw new Error('Use the HOUSEofAMES account page on the configured site');
  return origin;
}
export function newSocialAttempt(provider: SocialProvider, now = Date.now()) {
  return { nonce: randomBytes(32).toString('hex'), provider, createdAt: now };
}
export function validSocialAttempt(raw: string | undefined, state: string | null, now = Date.now()) {
  if (!raw || raw.length > 512 || !state || !/^[a-f0-9]{64}$/.test(state)) throw new Error('Sign-in expired. Please start again');
  const value = JSON.parse(raw) as ReturnType<typeof newSocialAttempt>;
  if (!socialProviders.includes(value.provider) || !/^[a-f0-9]{64}$/.test(value.nonce) || !Number.isFinite(value.createdAt) || now < value.createdAt || now - value.createdAt > SOCIAL_AGE * 1000 || !timingSafeEqual(Buffer.from(state), Buffer.from(value.nonce))) throw new Error('Sign-in expired. Please start again');
  return value;
}
export function socialRedirect(provider: SocialProvider, origin: string, nonce: string) {
  const endpoint = process.env.APPWRITE_ENDPOINT, project = process.env.APPWRITE_PROJECT_ID;
  if (!endpoint || !project || !process.env.APPWRITE_API_KEY) throw new Error('Social sign-in is not configured');
  const url = new URL(endpoint);
  if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1'].includes(url.hostname)))) throw new Error('Invalid account service configuration');
  // REST equivalent of createOAuth2Token; supports TikTok on newer Appwrite servers
  // without changing the existing SDK used by the rest of the application.
  url.pathname = url.pathname.replace(/\/$/, '') + '/account/tokens/oauth2/' + provider;
  const callback = new URL('/api/customer/oauth/callback', origin);
  callback.searchParams.set('ames_state', nonce);
  url.searchParams.set('project', project);
  url.searchParams.set('success', callback.href);
  callback.searchParams.set('cancelled', '1');
  url.searchParams.set('failure', callback.href);
  return url.href;
}
