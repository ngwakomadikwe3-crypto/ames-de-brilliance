import { AppwriteAuctionStore, AUCTION_TABLES, getTables } from '../auction/appwrite-store.ts';
import { DB_ID } from '../appwrite.ts';
import { Query } from 'node-appwrite';
import { sendMail } from '../email.ts';
import { AppwriteBidderDirectory } from './appwrite-directory.ts';
import { AuctionStoreRateLimiter } from './rate-limit.ts';
import type { AuditFn } from './service.ts';
import type { Bid } from '../auction/types.ts';

/**
 * Production wiring for the bidder routes: real Appwrite directory, shared
 * rate limiter, SMTP mailer and audit sink. Routes stay thin wrappers over
 * the (fully unit-tested) service layer; tests inject memory equivalents.
 */
export function bidderWire() {
  const directory = new AppwriteBidderDirectory();
  const auctionStore = new AppwriteAuctionStore();
  const limiter = new AuctionStoreRateLimiter(auctionStore);

  const audit: AuditFn = async ({ entity, entityId, action, actor, detail, now }) => {
    await auctionStore.appendAudit({
      entity,
      entityId,
      action,
      actor,
      detail: JSON.stringify(detail),
      createdAt: now.toISOString(),
    });
  };

  return { directory, limiter, audit, mailer: { sendMail } };
}

/** All bids placed by a bidder (data export). */
export async function bidsForBidder(bidderId: string): Promise<Bid[]> {
  const res = await getTables().listRows({
    databaseId: DB_ID,
    tableId: AUCTION_TABLES.bids,
    queries: [Query.equal('bidder_id', bidderId), Query.limit(1000)],
  });
  return (res.rows as unknown as Record<string, unknown>[]).map((r) => ({
    id: String(r.$id),
    lotId: String(r.lot_id),
    bidderId: String(r.bidder_id),
    amountMinor: Number(r.amount_minor),
    currency: String(r.currency),
    idempotencyKey: String(r.idempotency_key ?? ''),
    createdAt: String(r.created_at ?? r.$createdAt),
  }));
}

/** Count of audit entries referencing a bidder (data export transparency). */
export async function auditCountForEntity(entityId: string): Promise<number> {
  const res = await getTables().listRows({
    databaseId: DB_ID,
    tableId: AUCTION_TABLES.auditLog,
    queries: [Query.equal('entity_id', entityId), Query.limit(1)],
  });
  return res.total;
}
