import { ConflictError, DuplicateKeyError } from './store.ts';
import type { AuctionStore, AuctionTx } from './store.ts';
import type { AuditEntry, Bid, Lot } from './types.ts';

/**
 * In-memory AuctionStore for unit tests and local development. It emulates
 * the Appwrite Transactions API's optimistic concurrency: reads inside a
 * transaction record the lot revision, and commit throws ConflictError if any
 * read lot changed meanwhile. Microtask yields at read/commit points let
 * Promise.all'd bids genuinely interleave, so the concurrency tests exercise
 * the same retry paths the Appwrite adapter hits under real races.
 *
 * NOT for production: state is per-process and lost on restart.
 */
type StoredLot = Lot & { _rev: number };

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

function stripRev(lot: StoredLot): Lot {
  const { _rev, ...rest } = lot;
  void _rev;
  return { ...rest };
}

export class MemoryAuctionStore implements AuctionStore {
  private lots = new Map<string, StoredLot>();
  private bids = new Map<string, Bid>();
  private audits: AuditEntry[] = [];
  private rateWindows = new Map<string, { count: number; expiresMs: number }>();
  /** Committed lot updates, in commit order — used by tests to rebuild history. */
  readonly committedLotVersions: Lot[] = [];

  seedLot(lot: Lot): void {
    this.lots.set(lot.id, { ...lot, _rev: 0 });
  }

  auditTrail(): AuditEntry[] {
    return [...this.audits];
  }

  async getLot(lotId: string): Promise<Lot | null> {
    await tick();
    const lot = this.lots.get(lotId);
    return lot ? stripRev(lot) : null;
  }

  async listLots(): Promise<Lot[]> {
    await tick();
    return [...this.lots.values()].map(stripRev);
  }

  async getBid(bidId: string): Promise<Bid | null> {
    await tick();
    const bid = this.bids.get(bidId);
    return bid ? { ...bid } : null;
  }

  async listBidsForLot(lotId: string): Promise<Bid[]> {
    await tick();
    return [...this.bids.values()]
      .filter((b) => b.lotId === lotId)
      .sort((a, b) => a.amountMinor - b.amountMinor);
  }

  async appendAudit(entry: AuditEntry): Promise<void> {
    await tick();
    this.audits.push({ ...entry });
  }

  async updateLotCloseNotification(
    lotId: string,
    state: { status: 'sent' | 'failed'; error: string; at: string },
  ): Promise<void> {
    await tick();
    const stored = this.lots.get(lotId);
    if (!stored) return;
    // Deliberately does NOT bump _rev: the lot is terminal by the time the
    // sweeper writes notification state, and bumping would false-positive the
    // revision check of any read-only transaction that happened to span us.
    this.lots.set(lotId, {
      ...stored,
      closeNotifyStatus: state.status,
      closeNotifyError: state.error,
      closeNotifiedAt: state.at,
    });
  }

  async rateLimitHit(key: string, windowSeconds: number, maxHits: number, now: Date): Promise<boolean> {
    await tick();
    const windowMs = windowSeconds * 1000;
    const windowStart = Math.floor(now.getTime() / windowMs);
    const k = `${key}:${windowStart}`;
    const current = this.rateWindows.get(k);
    if (!current || current.expiresMs <= now.getTime()) {
      this.rateWindows.set(k, { count: 1, expiresMs: (windowStart + 1) * windowMs });
      return true;
    }
    if (current.count >= maxHits) return false;
    current.count += 1;
    return true;
  }

  async inTransaction<T>(work: (tx: AuctionTx) => Promise<T>): Promise<T> {
    const readRevs = new Map<string, number>();
    const stagedLots = new Map<string, Lot>();
    const stagedBids: Bid[] = [];
    const stagedAudits: AuditEntry[] = [];

    const tx: AuctionTx = {
      getLot: async (lotId: string) => {
        await tick();
        const staged = stagedLots.get(lotId);
        if (staged) return { ...staged };
        const stored = this.lots.get(lotId);
        readRevs.set(lotId, stored ? stored._rev : -1);
        return stored ? stripRev(stored) : null;
      },
      stageLotUpdate: (lot: Lot) => {
        stagedLots.set(lot.id, { ...lot });
      },
      stageBidCreate: (bid: Bid) => {
        stagedBids.push({ ...bid });
      },
      stageAudit: (entry: AuditEntry) => {
        stagedAudits.push({ ...entry });
      },
    };

    const result = await work(tx);
    await tick(); // widen the commit window so concurrent transactions interleave

    for (const [lotId, rev] of readRevs) {
      const stored = this.lots.get(lotId);
      const currentRev = stored ? stored._rev : -1;
      if (currentRev !== rev) {
        throw new ConflictError(`lot ${lotId} changed during transaction`);
      }
    }
    for (const bid of stagedBids) {
      if (this.bids.has(bid.id)) throw new DuplicateKeyError(bid.id);
    }
    for (const [lotId, lot] of stagedLots) {
      const stored = this.lots.get(lotId);
      const next: StoredLot = { ...lot, _rev: (stored ? stored._rev : -1) + 1 };
      this.lots.set(lotId, next);
      this.committedLotVersions.push(stripRev(next));
    }
    for (const bid of stagedBids) this.bids.set(bid.id, { ...bid });
    for (const entry of stagedAudits) this.audits.push({ ...entry });
    return result;
  }
}
