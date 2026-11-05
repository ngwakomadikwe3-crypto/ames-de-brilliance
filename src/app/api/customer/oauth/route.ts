import { NextRequest, NextResponse } from 'next/server';
import { checkChatOrigin, readChatJson, privateHeaders, consumeQuota } from '@/lib/chat-security';
import { socialProviders, enabledSocialProviders, socialOrigin, newSocialAttempt, socialRedirect, SOCIAL_COOKIE, SOCIAL_AGE, type SocialProvider } from '@/lib/customer-social';
export const runtime = 'nodejs';
export async function GET() {
  return NextResponse.json({ providers: socialProviders.map(id => ({ id, enabled: enabledSocialProviders().includes(id) })) }, { headers: privateHeaders });
}
export async function POST(req: NextRequest) {
  try {
    checkChatOrigin(req); const origin = socialOrigin(req.url);
    if (req.headers.get('origin') !== origin) return NextResponse.json({ error: 'Start sign-in from the account page.' }, { status: 403, headers: privateHeaders });
    if (req.cookies.has('ames_customer_session')) return NextResponse.json({ error: 'You are already signed in. Sign out before changing accounts.' }, { status: 409, headers: privateHeaders });
    const body = await readChatJson(req), provider = body.provider as SocialProvider;
    if (!socialProviders.includes(provider)) return NextResponse.json({ error: 'This sign-in provider is not supported.' }, { status: 400, headers: privateHeaders });
    if (!enabledSocialProviders().includes(provider)) return NextResponse.json({ error: 'This sign-in option is not available yet. Please use email for now.' }, { status: 503, headers: privateHeaders });
    await consumeQuota(`social-login:${process.env.VERCEL ? req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown' : 'local'}`, 20);
    const attempt = newSocialAttempt(provider), redirect = socialRedirect(provider, origin, attempt.nonce);
    const response = NextResponse.json({ redirect }, { headers: privateHeaders });
    response.cookies.set(SOCIAL_COOKIE, JSON.stringify(attempt), { httpOnly: true, secure: origin.startsWith('https:'), sameSite: 'lax', path: '/api/customer/oauth', maxAge: SOCIAL_AGE });
    return response;
  } catch (e) {
    const status = (e as {status?: number}).status;
    return NextResponse.json({ error: status === 429 ? 'Too many attempts. Please try again later.' : 'Unable to start social sign-in. Please use email or try again.' }, { status: status === 403 ? 403 : status === 429 ? 429 : 503, headers: privateHeaders });
  }
}
