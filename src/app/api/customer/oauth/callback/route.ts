import { NextRequest, NextResponse } from 'next/server';
import { Account, Client } from 'node-appwrite';
import { socialOrigin, validSocialAttempt, enabledSocialProviders, SOCIAL_COOKIE } from '@/lib/customer-social';
export const runtime = 'nodejs';
export async function GET(req: NextRequest) {
  // Every exit scrubs provider credentials from the browser URL and referrer.
  const origin = new URL(req.url).origin;
  const result = (path: string) => {
    const response = NextResponse.redirect(new URL(path, origin), 303);
    response.headers.set('Cache-Control', 'private, no-store'); response.headers.set('Referrer-Policy', 'no-referrer');
    response.cookies.set(SOCIAL_COOKIE, '', { httpOnly: true, secure: origin.startsWith('https:'), sameSite: 'lax', path: '/api/customer/oauth', maxAge: 0 });
    return response;
  };
  let sessionSecret: string | undefined;
  const sessionAccount = (secret: string) => new Account(new Client().setEndpoint(process.env.APPWRITE_ENDPOINT!).setProject(process.env.APPWRITE_PROJECT_ID!).setSession(secret));
  try {
    socialOrigin(req.url);
    const query = req.nextUrl.searchParams;
    if (query.getAll('ames_state').length !== 1) throw new Error('Invalid state');
    const attempt = validSocialAttempt(req.cookies.get(SOCIAL_COOKIE)?.value, query.get('ames_state'));
    if (!enabledSocialProviders().includes(attempt.provider) || req.cookies.has('ames_customer_session')) throw new Error('Attempt no longer eligible');
    if (query.has('cancelled') || query.has('error')) return result('/app/account?oauth=cancelled');
    const userId = query.get('userId'), secret = query.get('secret');
    if (query.getAll('userId').length !== 1 || query.getAll('secret').length !== 1 || !userId || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,35}$/.test(userId) || !secret || secret.length > 2048 || !/^[\x21-\x7e]+$/.test(secret)) throw new Error('Invalid callback credentials');
    const endpoint = process.env.APPWRITE_ENDPOINT, project = process.env.APPWRITE_PROJECT_ID, key = process.env.APPWRITE_API_KEY;
    if (!endpoint || !project || !key) throw new Error('Account service unavailable');
    const account = new Account(new Client().setEndpoint(endpoint).setProject(project).setKey(key));
    const session = await account.createSession({ userId, secret });
    sessionSecret = session.secret;
    if (!sessionSecret || session.userId !== userId || !Number.isFinite(Date.parse(session.expire)) || Date.parse(session.expire) <= Date.now()) throw new Error('Session was not established');
    const user = await sessionAccount(sessionSecret).get();
    if (user.$id !== userId || user.status === false) throw new Error('Account not available');
    const response = result(user.email && user.emailVerification ? '/workspace' : '/app/account?oauth=complete');
    response.cookies.set('ames_customer_session', sessionSecret, { httpOnly: true, secure: origin.startsWith('https:'), sameSite: 'lax', path: '/', expires: new Date(session.expire) });
    return response;
  } catch {
    if (sessionSecret) await sessionAccount(sessionSecret).deleteSession({ sessionId: 'current' }).catch(() => {});
    return result('/app/account?oauth=failed');
  }
}
