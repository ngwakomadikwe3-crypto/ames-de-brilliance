import { sessionTokenFromCookieHeader, verifyStaffSession } from './session.ts';

/**
 * Staff session role helper for the Phase 3a routes. Single verification
 * path: verifyStaffSession (HMAC + expiry + role presence) and then the role
 * itself, e.g. 'owner', 'staff', 'cousin', 'developer-admin'.
 */
export async function getStaffSessionRole(cookieHeader: string | null): Promise<string | null> {
  const token = sessionTokenFromCookieHeader(cookieHeader);
  if (!token) return null;
  if (!(await verifyStaffSession(token))) return null;
  try {
    const payload = token.split('.')[0];
    const payloadStr = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const session = JSON.parse(payloadStr);
    return typeof session.role === 'string' && session.role.length > 0 ? session.role : null;
  } catch {
    return null;
  }
}

/** Role label used as the audit actor for staff decisions, e.g. 'staff:owner'. */
export function staffActor(role: string): string {
  return `staff:${role}`;
}

/** Client IP for rate-limit keys; first hop of x-forwarded-for, else ''. */
export function clientIp(request: { headers: { get(name: string): string | null } }): string {
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return request.headers.get('x-real-ip') ?? '';
}
