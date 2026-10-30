import { timedTransitions } from './engine.ts';
import { resolveLotNow } from './place-bid.ts';
import { notifyLotClosed } from './close-notify.ts';
import type { CloseNotifyDeps } from './close-notify.ts';
import type { AuctionStore } from './store.ts';
import type { LotStatus } from './types.ts';

/**
 * Cron sweeper: closes every lot whose closesAt has passed and sends close
 * notifications for newly (or previously failed) sold lots.
 *
 * Safety properties:
 * - Uses resolveLotNow — the SAME lazy-close transactional path that bids and
 *   reads use — so it is idempotent and safe to run concurrently with user
 *   traffic, other sweepers, and itself.
 * - Idempotent: a second run finds no due transitions and skips lots whose
 *   notification state is already 'sent'.
 * - Notification failures never fail the sweep: they are recorded on the lot
 *   and retried on the next run.
 */
export interface SweepTransition {
  lotId: string;
  from: LotStatus;
  to: LotStatus;
}

export interface SweepSummary {
  scanned: number;
  transitioned: SweepTransition[];
  notified: string[];
  notifyFailed: string[];
}

export interface SweepOptions {
  now?: Date;
  /** Omit to sweep without sending notifications (dry close only). */
  notify?: CloseNotifyDeps;
}

export async function sweepExpiredLots(store: AuctionStore, opts: SweepOptions = {}): Promise<SweepSummary> {
  const now = opts.now ?? new Date();
  const lots = await store.listLots();
  const summary: SweepSummary = { scanned: lots.length, transitioned: [], notified: [], notifyFailed: [] };

  for (const stored of lots) {
    let lot = stored;
    if (timedTransitions(stored, now).length > 0) {
      const resolved = await resolveLotNow(store, stored.id, now);
      if (resolved) {
        if (resolved.status !== stored.status) {
          summary.transitioned.push({ lotId: stored.id, from: stored.status, to: resolved.status });
        }
        lot = resolved;
      }
    }
    if (opts.notify && lot.status === 'sold' && (lot.closeNotifyStatus ?? '') !== 'sent') {
      const outcome = await notifyLotClosed(store, lot, opts.notify);
      if (outcome === 'sent') summary.notified.push(lot.id);
      if (outcome === 'failed') summary.notifyFailed.push(lot.id);
    }
  }

  return summary;
}
