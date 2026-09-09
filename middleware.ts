import { NextRequest, NextResponse } from "next/server";
import { sessionSecret, sessionRole } from './src/lib/session-policy';
import { legacyPolicy } from './src/lib/legacy-policy.mjs';
import { customerIdentity, portalIdentity, sameOrigin } from './src/lib/legacy-auth.mjs';
import { chatOriginAllowed } from './src/lib/chat-origin.mjs';

const SESSION_SECRET = sessionSecret(process.env.SESSION_SECRET);

async function verifySession(token: string): Promise<boolean> {
  if (!SESSION_SECRET) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  try {
    const payload = parts[0];
    const signature = parts[1];

    // Decode base64url payload to string
    const payloadStr = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));

    // Import secret as raw key
    const encoder = new TextEncoder();
    const keyData = encoder.encode(SESSION_SECRET);
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    // Compute expected signature
    const bytes = Uint8Array.from(atob(signature.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    return await crypto.subtle.verify('HMAC', cryptoKey, bytes, encoder.encode(payloadStr)) && sessionRole(JSON.parse(payloadStr)) !== null;
  } catch {
    return false;
  }
}

function getSessionCookie(request: NextRequest): string | undefined {
  const cookie = request.headers.get("cookie") || "";
  const match = cookie.split(";").find((c) => c.trim().startsWith("adb_session="));
  if (!match) return undefined;
  return match.trim().split("=").slice(1).join("=");
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow login page and auth API through
  if (pathname.startsWith("/login") || pathname.startsWith("/api/auth/")) {
    return NextResponse.next();
  }

  const policy=legacyPolicy(request.url,request.method);
  if(policy==='handler') return NextResponse.next();
  if(pathname.startsWith('/api/')&&!['GET','HEAD','OPTIONS'].includes(request.method)&&!(pathname==='/api/chat'?chatOriginAllowed(request):sameOrigin(request)))return NextResponse.json({error:'Origin denied'},{status:403});
  if(policy==='public') return NextResponse.next();

  const token = getSessionCookie(request);
  if (token && (await verifySession(token))) {
    return NextResponse.next();
  }
  try {
    const customer=await customerIdentity(request);
    if(customer?.admin||policy==='customer'&&customer)return NextResponse.next();
    if(policy==='model'||policy==='trader'){
      const portal=await portalIdentity(request,policy);
      const code=pathname.split('/')[3];
      if(portal&&(code==='profile'||pathname==='/api/videos/upload'||code===portal.code))return NextResponse.next();
    }
  }catch{return NextResponse.json({error:'Identity service unavailable'},{status:503});}

  // If it's an API route, return 401
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Otherwise redirect to login
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/:path*"],
};
