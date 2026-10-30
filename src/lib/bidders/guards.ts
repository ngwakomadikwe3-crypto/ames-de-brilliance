import { sessionTokenFromCookieHeader, verifySession } from '../session.ts';

/**
 * Staff-side authorization for the bidder review workflow (Phase 3a).
 *
 * Role separation: only 'owner' and 'staff' may decide bidder verification.
 * The developer-admin role (and 'cousin') deliberately is NOT in the
 * allowlist — it can operate the rest of the dashboard but can never approve,
 * reject, suspend, export or anonymise a bidder, and can never view KYC
 * documents.
 */

export const BIDDER_DECIDER_ROLES = ['owner', 'staff'] as const;

export interface StaffActor {
  role: string;
  /** Staff display name when the session was minted from a staff row. */
  name: string;
}

function decodeSessionPayload(token: string): { role?: unknown; name?: unknown } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    return JSON.parse(atob(parts[0].replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}

/** Any valid staff-dashboard session, or null. */
export async function staffActorFromCookie(cookieHeader: string | null): Promise<StaffActor | null> {
  const token = sessionTokenFromCookieHeader(cookieHeader);
  if (!token || !(await verifySession(token))) return null;
  const payload = decodeSessionPayload(token);
  if (!payload || typeof payload.role !== 'string') return null;
  return { role: payload.role, name: typeof payload.name === 'string' ? payload.name : '' };
}

/** Decider-gated staff actor, or null when the role may not decide bidders. */
export async function deciderFromCookie(cookieHeader: string | null): Promise<StaffActor | null> {
  const actor = await staffActorFromCookie(cookieHeader);
  if (!actor) return null;
  if (!(BIDDER_DECIDER_ROLES as readonly string[]).includes(actor.role)) return null;
  return actor;
}

/** Audit actor label, e.g. 'staff:owner' or 'staff:Neo' when named. */
export function staffActorLabel(actor: StaffActor): string {
  return `staff:${actor.name || actor.role}`;
}
