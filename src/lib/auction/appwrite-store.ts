import { createHash } from 'node:crypto';
import { ID, Query, TablesDB } from 'node-appwrite';
import { DB_ID, getClient } from '../appwrite.ts';
import { ConflictError, DuplicateKeyError } from './store.ts';
import type { AuctionStore, AuctionTx } from './store.ts';
import type { AuditEntry, Bid, Lot } from './types.ts';

/**
 * Appwrite adapter for the auction store.
 *
 * Race safety comes from the Transactions API: the lot row is read inside the
 * transaction (getRow with transactionId), writes are staged with
 * createOperations, and updateTransaction({commit:true}) applies them
 * atomically. If the lot row changed outside the transaction after our read,
 * the commit fails with a conflict, which we surface as ConflictError so the
 * orchestrator retries against fresh state. Two simultaneous bids therefore
 * cannot both win a price level and the high bid can never move backwards.
 *
 * Idempotency: the bid row id is derived from the client idempotency key
 * (see place-bid.bidRowId); a replayed create collides at commit time and the
 * orchestrator returns the original bid.
 *
 * Collections are provisioned with empty permissions: no client-side access;
 * every read/write goes through server routes holding the API key.
 */

export const AUCTION_TABLES = {
  auctions: 'auctions',
  lots: 'lots',
  bidders: 'bidders',
  bids: 'bids',
  deposits: 'deposits',
  auditLog: 'audit_log',
  rateLimits: 'rate_limits',
} as const;

let _tables: TablesDB | null = null;
export function getTables(): TablesDB {
  if (_tables) return _tables;
  _tables = new TablesDB(getClient());
  return _tables;
}

function isAppwriteConflict(error: unknown): boolean {
  const e = error as { code?: number; type?: string; message?: string };
  if (e?.code === 409) return true;
  const text = `${e?.type ?? ''} ${e?.message ?? ''}`.toLowerCase();
  return text.includes('conflict') || text.includes('transaction');
}

function isDuplicateRow(error: unknown): boolean {
  const e = error as { code?: number; type?: string; message?: string };
  const text = `${e?.type ?? ''} ${e?.message ?? ''}`.toLowerCase();
  return e?.code === 409 && (text.includes('already') || text.includes('duplicate') || text.includes('exists'));
}

function rowToLot(r: Record<string, unknown>): Lot {
  return {
    id: String(r.$id),
    auctionId: String(r.auction_id),
    title: String(r.title ?? ''),
    description: String(r.description ?? ''),
    stoneRef: String(r.stone_ref ?? ''),
    currency: String(r.currency),
    status: r.status as Lot['status'],
    startingBidMinor: Number(r.starting_bid_minor),
    reserveMinor: Number(r.reserve_minor ?? 0),
    minIncrementMinor: Number(r.min_increment_minor),
    antiSnipeSeconds: Number(r.anti_snipe_seconds ?? 0),
    opensAt: String(r.opens_at),
    closesAt: String(r.closes_at),
    currentBidMinor: Number(r.current_bid_minor ?? 0),
    currentBidderId: String(r.current_bidder ?? ''),
    bidCount: Number(r.bid_count ?? 0),
    createdAt: String(r.created_at ?? r.$createdAt),
    closeNotifyStatus: (r.close_notify_status ?? '') as Lot['closeNotifyStatus'],
    closeNotifyError: String(r.close_notify_error ?? ''),
    closeNotifiedAt: String(r.close_notified_at ?? ''),
  };
}

function lotToRow(lot: Lot): Record<string, unknown> {
  return {
    auction_id: lot.auctionId,
    title: lot.title,
    description: lot.description,
    stone_ref: lot.stoneRef,
    currency: lot.currency,
    status: lot.status,
    starting_bid_minor: lot.startingBidMinor,
    reserve_minor: lot.reserveMinor,
    min_increment_minor: lot.minIncrementMinor,
    anti_snipe_seconds: lot.antiSnipeSeconds,
    opens_at: lot.opensAt,
    closes_at: lot.closesAt,
    current_bid_minor: lot.currentBidMinor,
    current_bidder: lot.currentBidderId,
    bid_count: lot.bidCount,
    created_at: lot.createdAt,
  };
}

function rowToBid(r: Record<string, unknown>): Bid {
  return {
    id: String(r.$id),
    lotId: String(r.lot_id),
    bidderId: String(r.bidder_id),
    amountMinor: Number(r.amount_minor),
    currency: String(r.currency),
    idempotencyKey: String(r.idempotency_key ?? ''),
    createdAt: String(r.created_at ?? r.$createdAt),
  };
}

function auditToRow(entry: AuditEntry): Record<string, unknown> {
  return {
    entity: entry.entity,
    entity_id: entry.entityId,
    action: entry.action,
    actor: entry.actor,
    detail: entry.detail,
    created_at: entry.createdAt,
  };
}

/** Rate-limit row ids get the same 36-char safe treatment as bid ids. */
function rateRowId(scope: string): string {
  return 'r' + createHash('sha256').update(scope).digest('hex').slice(0, 35);
}

export class AppwriteAuctionStore implements AuctionStore {
  private tables: TablesDB;

  constructor(tables?: TablesDB) {
    this.tables = tables ?? getTables();
  }

  async getLot(lotId: string): Promise<Lot | null> {
    try {
      const row = await this.tables.getRow({ databaseId: DB_ID, tableId: AUCTION_TABLES.lots, rowId: lotId });
      return rowToLot(row as unknown as Record<string, unknown>);
    } catch (error) {
      if ((error as { code?: number })?.code === 404) return null;
      throw error;
    }
  }

  async listLots(): Promise<Lot[]> {
    const res = await this.tables.listRows({
      databaseId: DB_ID,
      tableId: AUCTION_TABLES.lots,
      queries: [Query.limit(100)],
    });
    return (res.rows as unknown as Record<string, unknown>[]).map(rowToLot);
  }

  async getBid(bidId: string): Promise<Bid | null> {
    try {
      const row = await this.tables.getRow({ databaseId: DB_ID, tableId: AUCTION_TABLES.bids, rowId: bidId });
      return rowToBid(row as unknown as Record<string, unknown>);
    } catch (error) {
      if ((error as { code?: number })?.code === 404) return null;
      throw error;
    }
  }

  async appendAudit(entry: AuditEntry): Promise<void> {
    await this.tables.createRow({
      databaseId: DB_ID,
      tableId: AUCTION_TABLES.auditLog,
      rowId: ID.unique(),
      data: auditToRow(entry),
    });
  }

  async updateLotCloseNotification(
    lotId: string,
    state: { status: 'sent' | 'failed'; error: string; at: string },
  ): Promise<void> {
    // Non-transactional partial update on a terminal lot (see store.ts).
    await this.tables.updateRow({
      databaseId: DB_ID,
      tableId: AUCTION_TABLES.lots,
      rowId: lotId,
      data: {
        close_notify_status: state.status,
        close_notify_error: state.error,
        close_notified_at: state.at,
      },
    });
  }

  async inTransaction<T>(work: (tx: AuctionTx) => Promise<T>): Promise<T> {
    const transaction = await this.tables.createTransaction({ ttl: 60 });
    const staged: object[] = [];
    const tx: AuctionTx = {
      getLot: async (lotId: string) => {
        try {
          const row = await this.tables.getRow({
            databaseId: DB_ID,
            tableId: AUCTION_TABLES.lots,
            rowId: lotId,
            transactionId: transaction.$id,
          });
          return rowToLot(row as unknown as Record<string, unknown>);
        } catch (error) {
          if ((error as { code?: number })?.code === 404) return null;
          throw error;
        }
      },
      stageLotUpdate: (lot: Lot) => {
        staged.push({
          action: 'update',
          databaseId: DB_ID,
          tableId: AUCTION_TABLES.lots,
          rowId: lot.id,
          data: lotToRow(lot),
        });
      },
      stageBidCreate: (bid: Bid) => {
        staged.push({
          action: 'create',
          databaseId: DB_ID,
          tableId: AUCTION_TABLES.bids,
          rowId: bid.id,
          data: {
            lot_id: bid.lotId,
            bidder_id: bid.bidderId,
            amount_minor: bid.amountMinor,
            currency: bid.currency,
            idempotency_key: bid.idempotencyKey,
            created_at: bid.createdAt,
          },
        });
      },
      stageAudit: (entry: AuditEntry) => {
        staged.push({
          action: 'create',
          databaseId: DB_ID,
          tableId: AUCTION_TABLES.auditLog,
          rowId: ID.unique(),
          data: auditToRow(entry),
        });
      },
    };

    let result: T;
    try {
      result = await work(tx);
      if (staged.length > 0) {
        await this.tables.createOperations({ transactionId: transaction.$id, operations: staged });
      }
      await this.tables.updateTransaction({ transactionId: transaction.$id, commit: true });
      return result;
    } catch (error) {
      try {
        await this.tables.updateTransaction({ transactionId: transaction.$id, rollback: true });
      } catch {
        // Transaction may already be finished; TTL sweeps the rest.
      }
      if (isDuplicateRow(error)) throw new DuplicateKeyError('duplicate staged row id');
      if (isAppwriteConflict(error)) throw new ConflictError();
      throw error;
    }
  }

  async rateLimitHit(key: string, windowSeconds: number, maxHits: number, now: Date): Promise<boolean> {
    const windowMs = windowSeconds * 1000;
    const windowStart = Math.floor(now.getTime() / windowMs);
    const rowId = rateRowId(`${key}:${windowStart}`);
    try {
      await this.tables.createRow({
        databaseId: DB_ID,
        tableId: AUCTION_TABLES.rateLimits,
        rowId,
        data: {
          key,
          window_start: windowStart,
          count: 1,
          expires_at: new Date((windowStart + 1) * windowMs).toISOString(),
        },
      });
      return true;
    } catch (error) {
      if (!isDuplicateRow(error) && (error as { code?: number })?.code !== 409) throw error;
    }
    try {
      // Atomic shared-storage increment; the server rejects the increment that
      // would cross max, which is exactly the hit we want to deny.
      await this.tables.incrementRowColumn({
        databaseId: DB_ID,
        tableId: AUCTION_TABLES.rateLimits,
        rowId,
        column: 'count',
        value: 1,
        max: maxHits,
      });
      return true;
    } catch (error) {
      const e = error as { code?: number; message?: string };
      // The bound rejection surfaces as a 400/409; anything else is a real error.
      if (e?.code === 400 || e?.code === 409) return false;
      throw error;
    }
  }
}
