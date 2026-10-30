/**
 * Same-origin enforcement — ported from recovery/ames-visual proxy.ts
 * (src/lib/legacy-auth.mjs `sameOrigin`).
 *
 * Semantics preserved: the request's Origin header must equal AMES_APP_ORIGIN
 * when configured, else the request's own origin. Requests with no Origin
 * header (curl, server-to-server, the API smoke script) do not match and are
 * denied — browsers always send Origin on mutating fetches, which is exactly
 * the cross-site attack surface this closes.
 *
 * Edge-safe (used from middleware).
 */
export function sameOrigin(request: { url: string; headers: { get(name: string): string | null } }): boolean {
  const expected = process.env.AMES_APP_ORIGIN || new URL(request.url).origin;
  return request.headers.get('origin') === expected;
}
