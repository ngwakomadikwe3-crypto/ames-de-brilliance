import { sessionTokenFromCookieHeader, verifyStaffSession } from '../session.ts';
import { AppwriteBidderStore } from '../bidders/appwrite-store.ts';
import { bidderTokenFromCookieHeader, verifyBidderSession } from '../bidders/session.ts';
import { AUCTION_TERMS_VERSION } from '../bidders/terms.ts';
import type { BidderIdentity } from './types.ts';

/**
 * Bidder identity resolution.
 *
 * Phase 3a replaces the Phase 2a stub with real bidder accounts while keeping
 * the staff session as a house identity. Resolution order:
 *
 *   1. Staff session (adb_session) — always active, house test bids.
 *   2. Bidder session (adb_bidder) — ONLY when AUCTION_PUBLIC_BIDDING=1.
 *      With the flag off (the default), bidder cookies are ignored entirely
 *      and only staff can bid — merging Phase 3a cannot open public bidding.
 *
 * The bidder row is re-read from Appwrite on EVERY resolve: a suspension or
 * rejection takes effect immediately, including during a live auction.
 */
export interface BidderResolver {
  /** Returns null when the request carries no usable identity. */
  resolve(cookieHeader: string | null): Promise<BidderIdentity | null>;
  /**
   * Optional: resolve a bidder id to a notification email for close
   * notifications. Bidder accounts return their registered address; the
   * staff session has no inbox and returns null.
   */
  resolveEmail?(bidderId: string): Promise<string | null>;
}

/** True only for the exact opt-in value; everything else keeps bidding staff-only. */
export function publicBiddingEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.AUCTION_PUBLIC_BIDDING === '1';
}

export class StaffSessionBidderResolver implements BidderResolver {
  async resolve(cookieHeader: string | null): Promise<BidderIdentity | null> {
    const token = sessionTokenFromCookieHeader(cookieHeader);
    if (!token) return null;
    const valid = await verifyStaffSession(token);
    if (!valid) return null;
    return { bidderId: 'staff:session', verified: true, via: 'staff-session-stub' };
  }

  // The staff session is a shared house identity with no inbox of its own.
  // The house notification still goes out; the winner copy waits for Phase 3.
  async resolveEmail(): Promise<string | null> {
    return null;
  }
}

export class AppwriteBidderResolver implements BidderResolver {
  private store: AppwriteBidderStore;

  constructor(store?: AppwriteBidderStore) {
    this.store = store ?? new AppwriteBidderStore();
  }

  async resolve(cookieHeader: string | null): Promise<BidderIdentity | null> {
    const session = await verifyBidderSession(bidderTokenFromCookieHeader(cookieHeader));
    if (!session) return null;
    // Fresh read every time: suspension/rejection applies to the next request,
    // never after a cached grace period.
    const bidder = await this.store.getBidder(session.bid);
    if (!bidder || bidder.anonymisedAt) return null;
    return {
      bidderId: bidder.id,
      verified: bidder.status === 'verified',
      via: 'bidder-account',
      termsCurrent: bidder.termsVersion === AUCTION_TERMS_VERSION,
    };
  }

  async resolveEmail(bidderId: string): Promise<string | null> {
    try {
      const bidder = await this.store.getBidder(bidderId);
      if (!bidder || bidder.anonymisedAt) return null;
      return bidder.email || null;
    } catch {
      return null;
    }
  }
}

/** Staff first; bidders only behind the public-bidding flag. */
class ChainedBidderResolver implements BidderResolver {
  private resolvers: BidderResolver[];

  constructor(resolvers: BidderResolver[]) {
    this.resolvers = resolvers;
  }

  async resolve(cookieHeader: string | null): Promise<BidderIdentity | null> {
    for (const resolver of this.resolvers) {
      const identity = await resolver.resolve(cookieHeader);
      if (identity) return identity;
    }
    return null;
  }

  async resolveEmail(bidderId: string): Promise<string | null> {
    for (const resolver of this.resolvers) {
      if (!resolver.resolveEmail) continue;
      const email = await resolver.resolveEmail(bidderId);
      if (email) return email;
    }
    return null;
  }
}

/**
 * The production resolver chain: staff first, then bidder accounts behind the
 * public-bidding flag. `bidderStore` exists so tests can run the real chain
 * against the in-memory store.
 */
export function createDefaultBidderResolver(bidderStore?: AppwriteBidderStore): BidderResolver {
  const chain: BidderResolver[] = [new StaffSessionBidderResolver()];
  if (publicBiddingEnabled()) chain.push(new AppwriteBidderResolver(bidderStore ?? new AppwriteBidderStore()));
  return new ChainedBidderResolver(chain);
}

export const defaultBidderResolver: BidderResolver = createDefaultBidderResolver();
