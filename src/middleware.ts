import { NextRequest, NextResponse } from "next/server";

const SESSION_SECRET = process.env.SESSION_SECRET || "adb-session-secret-2026";

async function verifySession(token: string): Promise<boolean> {
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
      ["sign"]
    );

    // Compute expected signature
    const sigBuffer = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(payloadStr));
    // Convert to base64url
    const sigArray = new Uint8Array(sigBuffer);
    const expectedSig = btoa(String.fromCharCode(...sigArray))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    return signature === expectedSig;
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

  // Protect dashboard and dashboard APIs
  const needsAuth =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/api/requests") ||
    pathname.startsWith("/api/traders");

  if (!needsAuth) return NextResponse.next();

  const token = getSessionCookie(request);
  if (token && (await verifySession(token))) {
    return NextResponse.next();
  }

  // If it's an API route, return 401
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Otherwise redirect to login
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/requests/:path*", "/api/traders/:path*"],
};
