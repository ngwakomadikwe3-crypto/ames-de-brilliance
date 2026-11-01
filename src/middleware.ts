import { NextRequest, NextResponse } from "next/server";
import { sessionTokenFromCookieHeader, verifyStaffSession } from "@/lib/session";
import { sameOrigin } from "@/lib/same-origin";

/**
 * Edge middleware — buyer accounts.
 *
 * Ported from recovery/ames-visual proxy.ts (deliberate, partial port):
 *  - /login and /api/auth pass through FIRST (recovery order), so the login
 *    POST itself can never be blocked by the same-origin rule.
 *  - sameOrigin on mutating API calls: non-GET/HEAD/OPTIONS requests to the
 *    buyer and staff APIs must carry a matching Origin header
 *    (AMES_APP_ORIGIN when set, else the request's own origin). Requests with
 *    no Origin header are denied — browsers always send Origin on cross-site
 *    form/fetch POSTs, which is exactly the attack surface this closes.
 * Left out (legacy-only concerns): the legacyPolicy route table, the
 * customerIdentity/portalIdentity plumbing, and the /api/chat carve-out.
 * /api/cron stays outside the matcher entirely (Bearer-authed,
 * server-to-server, no Origin header by design). /api/lots is deliberately
 * NOT covered: the auction engine stays unrouted and disabled.
 *
 * Staff surfaces additionally require a STAFF session: verifyStaffSession
 * demands the role claim, so a validly signed buyer cookie (adb_buyer)
 * can never widen into the dashboard or staff APIs.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Login page and auth API pass through first (recovery order).
  if (pathname.startsWith("/login") || pathname.startsWith("/api/auth/")) {
    return NextResponse.next();
  }

  // Same-origin enforcement on mutating calls (ported from proxy.ts).
  const originChecked =
    pathname.startsWith("/api/buyers") ||
    pathname.startsWith("/api/staff");
  if (originChecked && !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    if (!sameOrigin(request)) {
      return NextResponse.json({ error: "Origin denied" }, { status: 403 });
    }
  }

  // Staff-only surfaces.
  const needsStaffAuth =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/api/requests") ||
    pathname.startsWith("/api/traders") ||
    pathname.startsWith("/api/staff");

  if (!needsStaffAuth) return NextResponse.next();

  const token = sessionTokenFromCookieHeader(request.headers.get("cookie"));
  if (token && (await verifyStaffSession(token))) {
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
  matcher: [
    "/dashboard/:path*",
    "/api/requests/:path*",
    "/api/traders/:path*",
    "/api/staff/:path*",
    "/api/buyers/:path*",
  ],
};
