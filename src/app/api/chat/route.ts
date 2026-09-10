import { NextRequest, NextResponse } from 'next/server';
import { customerIdentity, cookieValue } from '@/lib/legacy-auth.mjs';
import { chatOriginAllowed } from '@/lib/chat-origin.mjs';
import { difyConfig, difyIdentity, sendDify } from '@/lib/dify.mjs';
import { stoneRequest } from '@/lib/chat-stone-selection';

export const runtime = 'nodejs';
export const maxDuration = 50;
export async function POST(req: NextRequest) {
  const headers = { 'Cache-Control': 'no-store' };
  if (!chatOriginAllowed(req)) return NextResponse.json({ error: 'Origin denied' }, { status: 403, headers });
  try {
    const config = difyConfig();
    const raw = await req.text();
    if (raw.length > 16000) return NextResponse.json({ error: 'Message is too large' }, { status: 413, headers });
    let body;
    try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: 'Invalid message' }, { status: 400, headers }); }
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid message' }, { status: 400, headers });
    const account = await customerIdentity(req);
    const secure = new URL(process.env.AMES_APP_ORIGIN || req.url).protocol === 'https:';
    const cookieName = secure ? '__Host-ames_dify_guest' : 'ames_dify_guest';
    const identity = difyIdentity(account?.id, cookieValue(req, cookieName), config.secret);
    const result = await sendDify({ message: body.message, conversationToken: body.conversationToken, user: identity.user }, config);
    const response = NextResponse.json({ ...result, stone: stoneRequest(result.reply) }, { headers });
    if (identity.guestToken) response.cookies.set(cookieName, identity.guestToken, { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 86400 });
    return response;
  } catch (error: unknown) {
    const known = error as { status?: number; message?: string };
    return NextResponse.json({ error: known.status ? known.message : 'AMES chat is temporarily unavailable. Please try again.' }, { status: known.status || 503, headers });
  }
}
