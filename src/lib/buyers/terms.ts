/**
 * Buyer terms versioning.
 *
 * Making offers requires acceptance of THIS version. Bump the constant when
 * the owner's lawyer replaces docs/buyer-terms.md; verified buyers then have
 * to re-accept before their next offer (offer routes reject with
 * 'terms_not_accepted' and the UI offers the acceptance flow).
 */
export const BUYER_TERMS_VERSION = '2026-10-draft-1';
