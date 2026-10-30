import { sessionTokenFromCookieHeader, verifySession } from '../session.ts';
import type { BidderIdentity } from './types.ts';

/**
 * Bidder identity resolution.
 *
 * Phase 2a ships a stub: the only authenticated server-side identity that
 * exists today is the staff HMAC session, so the staff resolver below marks
 * staff as verified bidders (useful for staging and house test bids). Phase 3
 * replaces this with real bidder accounts, KYC tiers and deposit checks by
 * providing another BidderResolver implementation — the bid engine and routes
 * depend only on the interface.
 */
export interface BidderResolver {
  /** Returns null when the request carries no usable identity. */
  resolve(cookieHeader: string | null): Promise<BidderIdentity | null>;
}

export class StaffSessionBidderResolver implements BidderResolver {
  async resolve(cookieHeader: string | null): Promise<BidderIdentity | null> {
    const token = sessionTokenFromCookieHeader(cookieHeader);
    if (!token) return null;
    const valid = await verifySession(token);
    if (!valid) return null;
    return { bidderId: 'staff:session', verified: true, via: 'staff-session-stub' };
  }
}

export const defaultBidderResolver: BidderResolver = new StaffSessionBidderResolver();
