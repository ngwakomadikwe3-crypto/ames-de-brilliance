import type { AuditEntry, Bid, Lot } from './types.ts';

/**
 * Storage contract for the auction engine.
 *
 * Concurrency contract: inTransaction() must guarantee that if the lot row (or
 * a bid row id) changed outside the transaction between the tx read and the
 * commit, the commit fails by throwing ConflictError (or DuplicateKeyError for
 * idempotency-key collisions). The Appwrite adapter implements this with the
 * Transactions API; the memory adapter emulates it with revision checks so the
 * orchestrator and its retry loop are exercised identically in unit tests.
 */
export class ConflictError extends Error {
  constructor(message = 'conflict: concurrent modification') {
    super(message);
    this.name = 'ConflictError';
  }
}

export class DuplicateKeyError extends Error {
  constructor(id: string) {
    super(`duplicate row id: ${id}`);
    this.name = 'DuplicateKeyError';
  }
}

export interface AuctionTx {
  /** Read inside the transaction; joins the conflict-detection set. */
  getLot(lotId: string): Promise<Lot | null>;
  /** Stage a full lot replacement (applied at commit). */
  stageLotUpdate(lot: Lot): void;
  /** Stage a bid row create; bid.id is the idempotency row id. */
  stageBidCreate(bid: Bid): void;
  /** Stage an append-only audit row. */
  stageAudit(entry: AuditEntry): void;
}

export interface AuctionStore {
  getLot(lotId: string): Promise<Lot | null>;
  listLots(): Promise<Lot[]>;
  /** Look up a bid by its idempotency-derived row id. */
  getBid(bidId: string): Promise<Bid | null>;
  /** Non-transactional audit append (used for rejections, which mutate nothing). */
  appendAudit(entry: AuditEntry): Promise<void>;
  inTransaction<T>(work: (tx: AuctionTx) => Promise<T>): Promise<T>;
  /**
   * Shared-storage rate limiting. Returns true when the hit is allowed.
   * Implementations must be atomic across processes (no in-memory counters in
   * production); key is scoped per window: hit #maxHits+1 in a window fails.
   */
  rateLimitHit(key: string, windowSeconds: number, maxHits: number, now: Date): Promise<boolean>;
}
