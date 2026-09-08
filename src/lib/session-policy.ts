/** Shared by Node and Edge; no default secret. */
export const SESSION_MAX_AGE = 60 * 60 * 8;
export function sessionSecret(value: string | undefined): string | null {
  return value && value.length >= 32 && value !== 'adb-session-secret-2026' ? value : null;
}
export function sessionRole(payload: unknown, now = Date.now()): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const { ts, role } = payload as { ts?: unknown; role?: unknown };
  if (typeof ts !== 'number' || !Number.isFinite(ts) || ts > now || now - ts >= SESSION_MAX_AGE * 1000) return null;
  return typeof role === 'string' && ['owner', 'cousin', 'staff'].includes(role) ? role : null;
}
