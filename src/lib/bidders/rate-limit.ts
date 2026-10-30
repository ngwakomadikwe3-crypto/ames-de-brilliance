import type { AuctionStore } from '../auction/store.ts';

/**
 * Minimal shared-store rate limiter for the bidder auth routes, backed by the
 * auction engine's rate_limits table (atomic, cross-process — see
 * appwrite-store.ts). Tests swap in MemoryAuctionStore.
 */
export interface RateLimiter {
  hit(key: string, windowSeconds: number, maxHits: number, now: Date): Promise<boolean>;
}

export class AuctionStoreRateLimiter implements RateLimiter {
  private store: AuctionStore;

  constructor(store: AuctionStore) {
    this.store = store;
  }

  hit(key: string, windowSeconds: number, maxHits: number, now: Date): Promise<boolean> {
    return this.store.rateLimitHit(key, windowSeconds, maxHits, now);
  }
}
