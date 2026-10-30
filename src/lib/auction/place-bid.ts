import { createHash } from 'node:crypto';
import { applyTransitions, decideBid, timedTransitions } from './engine.ts';
import type { BidRejectReason } from './engine.ts';
import { ConflictError, DuplicateKeyError } from './store.ts';
import type { AuctionStore } from './store.ts';
import type { AuditEntry, Bid, BidderIdentity, Lot } from './types.ts';

/**
 * Bid orchestration: lazy time transitions, validation, anti-snipe,
 * idempotency, conflict retries and audit. Pure with respect to the store
 * interface — identical code path for the Appwrite adapter and the in-memory
 * test adapter.
 */

export const MAX_TX_ATTEMPTS = 5;
export const BID_RATE_LIMIT_WINDOW_SECONDS = 60;
export const DEFAULT_BID_RATE_LIMIT_PER_MINUTE = 12;

export type PlaceBidInput = {
  lotId: string;
  bidder: BidderIdentity;
  /** Integer minor units in the lot's currency. */
  amountMinor: number;
  /** Client idempotency key; replays return the original bid. */
  idempotencyKey: string;
  /** Injectable clock for tests. */
  now?: Date;
  /** Injectable sleeper for tests (backoff between conflict retries). */
  sleep?: (ms: number) => Promise<void>;
  /** Rate limit override; defaults to AUCTION_BID_RATE_LIMIT_PER_MINUTE or 12. */
  rateLimitPerMinute?: number;
  /** Conflict retry budget; defaults to MAX_TX_ATTEMPTS. */
  maxAttempts?: number;
};

export type PlaceBidResult =
  | { status: 'accepted'; bid: Bid; lot: Lot; replayed: boolean; extended: boolean }
  | { status: 'rejected'; reason: BidRejectReason | 'rate_limited' | 'lot_not_found'; minimumMinor?: number };

/** Appwrite row ids: <=36 chars, [a-zA-Z0-9._-], not starting with a special char. */
export function bidRowId(idempotencyKey: string): string {
  return 'b' + createHash('sha256').update(idempotencyKey).digest('hex').slice(0, 35);
}

function audit(entity: AuditEntry['entity'], entityId: string, action: AuditEntry['action'], actor: string, detail: unknown, now: Date): AuditEntry {
  return { entity, entityId, action, actor, detail: JSON.stringify(detail), createdAt: now.toISOString() };
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function configuredRateLimit(): number {
  const raw = process.env.AUCTION_BID_RATE_LIMIT_PER_MINUTE;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_BID_RATE_LIMIT_PER_MINUTE;
}

export async function placeBid(store: AuctionStore, input: PlaceBidInput): Promise<PlaceBidResult> {
  const now = input.now ?? new Date();
  const sleep = input.sleep ?? defaultSleep;
  const perMinute = input.rateLimitPerMinute ?? configuredRateLimit();
  const maxAttempts = input.maxAttempts ?? MAX_TX_ATTEMPTS;
  const bidId = bidRowId(input.idempotencyKey);
  const actor = input.bidder.bidderId;

  const allowed = await store.rateLimitHit(`bid:${actor}`, BID_RATE_LIMIT_WINDOW_SECONDS, perMinute, now);
  if (!allowed) {
    await store.appendAudit(audit('bidder', actor, 'bid.rate_limited', actor, { lotId: input.lotId, amountMinor: input.amountMinor }, now));
    return { status: 'rejected', reason: 'rate_limited' };
  }

  const replayed = await store.getBid(bidId);
  if (replayed) {
    const lot = await store.getLot(input.lotId);
    return { status: 'accepted', bid: replayed, lot: lot as Lot, replayed: true, extended: false };
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    type TxOutcome =
      | { kind: 'missing' }
      | { kind: 'rejected'; reason: BidRejectReason; minimumMinor?: number; lot: Lot }
      | { kind: 'accepted'; bid: Bid; lot: Lot; extended: boolean };
    let outcome: TxOutcome;
    try {
      outcome = await store.inTransaction(async (tx) => {
        const stored = await tx.getLot(input.lotId);
        if (!stored) return { kind: 'missing' };

        // Lazy time transitions run first, inside the same transaction, so a
        // lot that just expired is settled before the bid is judged.
        let lot = stored;
        const seq = timedTransitions(lot, now);
        if (seq.length > 0) {
          let prev = lot.status;
          for (const to of seq) {
            tx.stageAudit(audit('lot', lot.id, 'lot.transition', 'system', { from: prev, to }, now));
            prev = to;
          }
          lot = applyTransitions(lot, seq);
          tx.stageLotUpdate(lot);
        }

        const decision = decideBid(lot, input.bidder, input.amountMinor, now);
        if (!decision.ok) {
          return { kind: 'rejected', reason: decision.reason, minimumMinor: decision.minimumMinor, lot };
        }

        const bid: Bid = {
          id: bidId,
          lotId: lot.id,
          bidderId: input.bidder.bidderId,
          amountMinor: input.amountMinor,
          currency: lot.currency,
          idempotencyKey: input.idempotencyKey,
          createdAt: now.toISOString(),
        };
        const updated: Lot = { ...lot, ...decision.patch };
        tx.stageBidCreate(bid);
        tx.stageLotUpdate(updated);
        if (decision.extended) {
          tx.stageAudit(audit('lot', lot.id, 'lot.extended', actor, { from: lot.closesAt, to: updated.closesAt, antiSnipeSeconds: lot.antiSnipeSeconds }, now));
        }
        tx.stageAudit(audit('bid', bid.id, 'bid.accepted', actor, { lotId: lot.id, amountMinor: bid.amountMinor, currency: bid.currency }, now));
        return { kind: 'accepted', bid, lot: updated, extended: decision.extended };
      });
    } catch (error) {
      if (error instanceof ConflictError || error instanceof DuplicateKeyError) {
        // A concurrent transaction won. First check whether it was our own
        // idempotent twin; otherwise re-read and re-validate from scratch.
        const twin = await store.getBid(bidId);
        if (twin) {
          const lot = await store.getLot(input.lotId);
          return { status: 'accepted', bid: twin, lot: lot as Lot, replayed: true, extended: false };
        }
        if (attempt < maxAttempts) {
          await sleep(25 * 2 ** attempt + Math.floor(Math.random() * 25));
          continue;
        }
      }
      throw error;
    }

    if (outcome.kind === 'missing') {
      return { status: 'rejected', reason: 'lot_not_found' };
    }
    if (outcome.kind === 'rejected') {
      await store.appendAudit(audit('bid', bidId, 'bid.rejected', actor, { lotId: input.lotId, amountMinor: input.amountMinor, reason: outcome.reason, minimumMinor: outcome.minimumMinor }, now));
      return { status: 'rejected', reason: outcome.reason, minimumMinor: outcome.minimumMinor };
    }
    return { status: 'accepted', bid: outcome.bid, lot: outcome.lot, replayed: false, extended: outcome.extended };
  }
  // Unreachable: the loop either returns or throws; keeps TS honest.
  throw new Error('placeBid: exhausted attempts without resolution');
}

/**
 * Lazy close for reads: apply any due time transitions and persist them
 * through the same transactional path bids use. Returns the current state.
 */
export async function resolveLotNow(store: AuctionStore, lotId: string, now: Date = new Date()): Promise<Lot | null> {
  for (let attempt = 1; attempt <= MAX_TX_ATTEMPTS; attempt++) {
    try {
      return await store.inTransaction(async (tx) => {
        const stored = await tx.getLot(lotId);
        if (!stored) return null;
        const seq = timedTransitions(stored, now);
        if (seq.length === 0) return stored;
        let prev = stored.status;
        for (const to of seq) {
          tx.stageAudit(audit('lot', stored.id, 'lot.transition', 'system', { from: prev, to }, now));
          prev = to;
        }
        const lot = applyTransitions(stored, seq);
        tx.stageLotUpdate(lot);
        return lot;
      });
    } catch (error) {
      if ((error instanceof ConflictError) && attempt < MAX_TX_ATTEMPTS) {
        await defaultSleep(25 * 2 ** attempt);
        continue;
      }
      throw error;
    }
  }
  throw new Error('resolveLotNow: exhausted attempts without resolution');
}

/** List lots with lazy time transitions applied. */
export async function listLotsResolved(store: AuctionStore, now: Date = new Date()): Promise<Lot[]> {
  const lots = await store.listLots();
  const resolved: Lot[] = [];
  for (const lot of lots) {
    if (timedTransitions(lot, now).length > 0) {
      resolved.push((await resolveLotNow(store, lot.id, now)) ?? lot);
    } else {
      resolved.push(lot);
    }
  }
  return resolved;
}
