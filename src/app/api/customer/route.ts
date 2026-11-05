import { NextRequest, NextResponse } from 'next/server';
import { Account, Client, ID } from 'node-appwrite';
import { ChatError, checkChatOrigin, consumeQuota, privateHeaders, readChatJson } from '@/lib/chat-security';
import { normalizeDisplayName } from '@/lib/customer-preferences';

export const runtime = 'nodejs';
const COOKIE = 'ames_customer_session';
function account(secret?: string, admin = false) {
  const endpoint = process.env.APPWRITE_ENDPOINT, project = process.env.APPWRITE_PROJECT_ID;
  if (!endpoint || !project || (admin && !process.env.APPWRITE_API_KEY)) throw new ChatError(503, 'Customer accounts are not configured yet.');
  const client = new Client().setEndpoint(endpoint).setProject(project);
  if (secret) client.setSession(secret);
  if (admin) client.setKey(process.env.APPWRITE_API_KEY!);
  return new Account(client);
}
function signedIn(req: NextRequest) {
  const secret = req.cookies.get(COOKIE)?.value;
  if (!secret) throw new ChatError(401, 'Please sign in to your customer account.');
  return account(secret);
}
function publicUser(user: { $id?: string; name: string; email: string; emailVerification: boolean; prefs: Record<string, unknown> }) {
  return { id: user.$id, name: user.name, email: user.email, verified: user.emailVerification, haptics: user.prefs.amesHaptics !== false };
}
function failure(error: unknown) {
  const code = (error as { code?: number }).code;
  const type = (error as { type?: string }).type || '';
  const configurationFailure = type.startsWith('project_') || type === 'general_unauthorized_scope';
  const status = error instanceof ChatError ? error.status : configurationFailure ? 503 : code === 401 ? 401 : code === 429 ? 429 : code === 409 ? 409 : code === 400 ? 400 : 503;
  if (status === 503) console.error('[customer] Account service unavailable', { code, type: type || 'internal' });
  const message = error instanceof ChatError ? error.message : status === 401 ? 'Sign-in failed or your session expired. Check your details and try again.' : status === 409 ? 'Unable to create this account. Try signing in or resetting your password.' : status === 429 ? 'Too many attempts. Please wait before trying again.' : status === 400 ? 'The account service could not accept these details or the link has expired.' : 'Customer accounts are temporarily unavailable. Please try again shortly.';
  return NextResponse.json({ error: message }, { status, headers: privateHeaders });
}
export async function GET(req: NextRequest) {
  if (!req.cookies.has(COOKIE)) return NextResponse.json({ user: null }, { headers: privateHeaders });
  try { return NextResponse.json({ user: publicUser(await signedIn(req).get()) }, { headers: privateHeaders }); }
  catch (error) {
    const response = failure(error);
    if (response.status === 401) response.cookies.set(COOKIE, '', { httpOnly: true, secure: req.nextUrl.protocol === 'https:', sameSite: 'lax', path: '/', maxAge: 0 });
    return response;
  }
}
export async function POST(req: NextRequest) {
  try {
    checkChatOrigin(req);
    // Require an Origin even for login: prevents cross-site session substitution.
    if (req.headers.get('origin') !== new URL(req.url).origin) throw new ChatError(403, 'Please use the account form on this site.');
    const body = await readChatJson(req);
    const text = (key: string, max = 256) => {
      if (typeof body[key] !== 'string' || body[key].length > max) throw new ChatError(400, 'Please check the form details.');
      return body[key] as string;
    };
    const action = text('action', 30);
    const result = (value: unknown) => NextResponse.json(value, { headers: privateHeaders });
    if (action === 'complete-social-email') {
      const api = signedIn(req), current = await api.get();
      if (current.status === false || current.email) throw new ChatError(400, 'Use account support to change an existing contact email.');
      const email = text('email', 254).trim().toLowerCase(), password = text('password', 128);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12) throw new ChatError(400, 'Enter a valid email and a password of at least 12 characters.');
      await consumeQuota(`social-contact:${current.$id}`, 8);
      if (!current.passwordUpdate) await api.updatePassword({ password });
      const user = await api.updateEmail({ email, password });
      return result({ user: publicUser(user), message: 'Contact email saved. Send a verification email below to confirm it.' });
    }
    if (action === 'logout') {
      try { await signedIn(req).deleteSession({ sessionId: 'current' }); }
      catch (error) { if ((error as { code?: number }).code !== 401 && !(error instanceof ChatError && error.status === 401)) throw error; }
      const response = result({ user: null }); response.cookies.set(COOKIE, '', { httpOnly: true, secure: req.nextUrl.protocol === 'https:', sameSite: 'lax', path: '/', maxAge: 0 }); return response;
    }
    if (action === 'profile') {
      const name = normalizeDisplayName(text('name', 80));
      if (!name || typeof body.haptics !== 'boolean') throw new ChatError(400, 'Enter a display name and valid preferences.');
      const api = signedIn(req), current = await api.get();
      // Preserve other application preferences. Only this account's session can write them.
      await api.updatePrefs({ prefs: { ...current.prefs, amesHaptics: body.haptics } });
      const user = await api.updateName({ name });
      return result({ user: publicUser(user) });
    }
    if (action === 'verify') {
      await signedIn(req).createVerification({ url: new URL('/app/account?flow=verify', req.url).href });
      return result({ message: 'Verification link sent. Please check your email.' });
    }
    if (action === 'confirm-verification') {
      await account().updateVerification({ userId: text('userId'), secret: text('secret', 2048) });
      return result({ message: 'Email verified. You can now sign in.' });
    }
    if (action === 'reset') {
      const password = text('password', 128);
      if (password.length < 12) throw new ChatError(400, 'Use a password of at least 12 characters.');
      await account().updateRecovery({ userId: text('userId'), secret: text('secret', 2048), password });
      return result({ message: 'Password reset. Sign in with your new password.' });
    }
    if (!['login', 'register', 'recover'].includes(action)) throw new ChatError(400, 'Unknown account action.');
    const email = text('email', 254).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ChatError(400, 'Enter a valid email address.');
    if (action === 'recover') {
      try { await account().createRecovery({ email, url: new URL('/app/account?flow=reset', req.url).href }); }
      catch (error) { if ((error as { code?: number }).code !== 404) throw error; }
      return result({ message: 'If an account matches that email, a password reset link has been sent.' });
    }
    const password = text('password', 128);
    if (password.length < (action === 'register' ? 12 : 1)) throw new ChatError(400, 'Use a password of at least 12 characters.');
    // Distributed quota before the privileged SSR session call; never store raw email/IP.
    await consumeQuota(`customer-email:${email}`, 8);
    await consumeQuota(`customer-ip:${process.env.VERCEL ? req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown' : 'local'}`, 20);
    if (action === 'register') {
      const name = normalizeDisplayName(text('name', 80));
      if (!name) throw new ChatError(400, 'Enter your display name.');
      await account().create({ userId: ID.unique(), email, password, name });
    }
    const session = await account(undefined, true).createEmailPasswordSession({ email, password });
    if (!session.secret) throw new ChatError(503, 'Customer sign-in needs the Appwrite sessions.write permission.');
    const user = await account(session.secret).get();
    const response = result({ user: publicUser(user) });
    response.cookies.set(COOKIE, session.secret, { httpOnly: true, secure: req.nextUrl.protocol === 'https:', sameSite: 'lax', path: '/', expires: new Date(session.expire) });
    return response;
  } catch (error) { return failure(error); }
}
