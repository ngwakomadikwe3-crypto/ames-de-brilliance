import { sessionTokenFromCookieHeader, verifySession } from '../session.ts';
import { bidderTokenFromCookieHeader, verifyBidderToken } from '../bidders/session.ts';
import { AppwriteBidderDirectory } from '../bidders/appwrite-directory.ts';
import type { BidderDirectory } from '../bidders/directory.ts';
import type { BidderIdentity } from './types.ts';

/**
 * Bidder identity resolution — Phase 3a.
 *
 * CompositeBidderResolver checks, in order:
 *   1. The bidder cookie (adb_bidder). The bidder row is re-read from shared
 *      storage on EVERY call, so a staff suspension or rejection takes effect
 *      immediately — including mid-auction, between two bids. Anonymised
 *      accounts resolve to null (logged out).
 *   2. The staff session (adb_session) — the house identity from Phase 2a,
 *      always bid-capable regardless of the public-bidding flag.
 *
 * The two cookie families use different signing keys and a kind claim, so a
 * token from one can never verify as the other. The public-bidding flag and
 * the terms gate are enforced by the bid route on top of this identity.
 */
export interface BidderResolver {
  /** Returns null when the request carries no usable identity. */
  resolve(cookieHeader: string | null): Promise<BidderIdentity | null>;
  /**
   * Resolve a bidder id to a notification email for close notifications.
   * Real bidder accounts have one; the staff house identity does not.
   */
  resolveEmail?(bidderId: string): Promise<string | null>;
}

export class CompositeBidderResolver implements BidderResolver {
  private directory: () => BidderDirectory;

  constructor(directory: () => BidderDirectory) {
    this.directory = directory;
  }

  async resolve(cookieHeader: string | null): Promise<BidderIdentity | null> {
    const bidderToken = bidderTokenFromCookieHeader(cookieHeader);
    if (bidderToken) {
      const bidderId = verifyBidderToken(bidderToken);
      if (bidderId) {
        const bidder = await this.directory().getBidder(bidderId);
        // Missing or anonymised rows fall through to the staff check: a stale
        // bidder cookie must not mask a valid staff session on the same browser.
        if (bidder && !bidder.anonymisedAt) {
          return {
            bidderId: bidder.id,
            verified: bidder.status === 'verified',
            via: 'bidder-account',
            termsVersion: bidder.termsVersion,
          };
        }
      }
    }

    const staffToken = sessionTokenFromCookieHeader(cookieHeader);
    if (staffToken && (await verifySession(staffToken))) {
      return { bidderId: 'staff:session', verified: true, via: 'staff-session-stub' };
    }
    return null;
  }

  async resolveEmail(bidderId: string): Promise<string | null> {
    if (bidderId === 'staff:session') return null; // shared house identity, no inbox
    const bidder = await this.directory().getBidder(bidderId);
    if (!bidder || bidder.anonymisedAt) return null;
    return bidder.email || null;
  }
}

/** Backwards-compatible alias: the staff stub from Phase 2a. */
export class StaffSessionBidderResolver implements BidderResolver {
  async resolve(cookieHeader: string | null): Promise<BidderIdentity | null> {
    const token = sessionTokenFromCookieHeader(cookieHeader);
    if (!token) return null;
    const valid = await verifySession(token);
    if (!valid) return null;
    return { bidderId: 'staff:session', verified: true, via: 'staff-session-stub' };
  }

  async resolveEmail(): Promise<string | null> {
    return null;
  }
}

export const defaultBidderResolver: BidderResolver = new CompositeBidderResolver(
  () => new AppwriteBidderDirectory(),
);
