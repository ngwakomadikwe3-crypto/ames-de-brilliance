/**
 * Staff role matrix for lot management (STEP d1, amendment 1).
 *
 * Pure and shared by the API routes and the dashboard UI, mirroring
 * buyers/authz.ts. The matrix is the single source of truth for the tests.
 *
 * - owner / staff: prepare lots — create, edit, submit for review, manage
 *   photos, the model and compliance documents.
 * - owner ONLY: approve, publish, withdraw (publishing is owner-only per
 *   amendment 1; withdrawal also changes what the public catalogue shows,
 *   so it is owner-only too — flagged for Same Thwabi as a decision).
 * - developer-admin / cousin: no lot management (conservative default,
 *   matching the buyer review matrix).
 */
export const LOT_MANAGE_ROLES = ['owner', 'staff'] as const;
export const LOT_PUBLISH_ROLES = ['owner'] as const;

export type StaffRole = string | null | undefined;

/** May create/edit/submit lots and manage their media and documents. */
export function canManageLots(role: StaffRole): boolean {
  return typeof role === 'string' && (LOT_MANAGE_ROLES as readonly string[]).includes(role);
}

/** May approve, publish or withdraw (owner-only, amendment 1). */
export function canPublishLots(role: StaffRole): boolean {
  return typeof role === 'string' && (LOT_PUBLISH_ROLES as readonly string[]).includes(role);
}
