import { NextRequest, NextResponse } from "next/server";
import { sessionTokenFromCookieHeader, verifySession } from "@/lib/session";

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

  const token = sessionTokenFromCookieHeader(request.headers.get("cookie"));
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
