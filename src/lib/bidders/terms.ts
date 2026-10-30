/**
 * Auction terms versioning (Phase 3a).
 *
 * Bidding requires acceptance of THIS version. Bump the constant when the
 * owner's lawyer replaces docs/auction-terms.md; verified bidders then have
 * to re-accept before their next bid (the bid route rejects with
 * 'terms_not_accepted' and the UI offers the acceptance flow).
 */
export const AUCTION_TERMS_VERSION = '2026-10-draft-1';
