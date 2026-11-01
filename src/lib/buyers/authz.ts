/**
 * Staff role matrix for the buyer review workflow (Phase 3a).
 *
 * Pure and shared by the API routes and the dashboard UI. The matrix is the
 * single source of truth for the authz tests.
 *
 * - owner / staff: full review rights (view PII + documents, decide).
 * - developer-admin: platform operator, NOT a house decision-maker — no
 *   buyer PII, no decisions (per owner instruction).
 * - cousin: legacy read-mostly dashboard role — no buyer PII (conservative
 *   default; flagged as an owner decision).
 */
export const STAFF_REVIEW_ROLES = ['owner', 'staff'] as const;
export const STAFF_DECIDE_ROLES = ['owner', 'staff'] as const;

export type StaffRole = string | null | undefined;

/** May read the buyer queue, buyer PII and documents. */
export function canReviewBuyers(role: StaffRole): boolean {
  return typeof role === 'string' && (STAFF_REVIEW_ROLES as readonly string[]).includes(role);
}

/** May approve / reject / suspend / export / anonymise. */
export function canDecideBuyers(role: StaffRole): boolean {
  return typeof role === 'string' && (STAFF_DECIDE_ROLES as readonly string[]).includes(role);
}
