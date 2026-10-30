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
  /**
   * Optional: resolve a bidder id to a notification email for close
   * notifications. The Phase 2a staff stub has no per-user email and returns
   * null; Phase 3 bidder accounts provide real addresses.
   */
  resolveEmail?(bidderId: string): Promise<string | null>;
}

export class StaffSessionBidderResolver implements BidderResolver {
  async resolve(cookieHeader: string | null): Promise<BidderIdentity | null> {
    const token = sessionTokenFromCookieHeader(cookieHeader);
    if (!token) return null;
    const valid = await verifySession(token);
    if (!valid) return null;
    return { bidderId: 'staff:session', verified: true, via: 'staff-session-stub' };
  }

  // The staff session is a shared house identity with no inbox of its own.
  // The house notification still goes out; the winner copy waits for Phase 3.
  async resolveEmail(): Promise<string | null> {
    return null;
  }
}

export const defaultBidderResolver: BidderResolver = new StaffSessionBidderResolver();
