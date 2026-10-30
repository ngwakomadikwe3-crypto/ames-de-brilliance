import type { AuctionStore } from './store.ts';
import type { Lot } from './types.ts';

/**
 * Close notifications for hammered lots (Phase 2b).
 *
 * Contract:
 * - Fires only for lots whose status is 'sold'.
 * - Emails the house desk always (when an address is configured) and the
 *   winner when a resolver can map the bidder id to an address (the Phase 2a
 *   staff stub cannot, so the winner copy is skipped until Phase 3).
 * - NEVER throws and NEVER blocks or rolls back a close: the lot transition
 *   commits first; notification state is recorded on the lot afterwards, and
 *   any failure is logged + marked 'failed' so the next sweep retries.
 */
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export type SendMail = (msg: MailMessage) => Promise<boolean>;

export interface CloseNotifyDeps {
  sendMail: SendMail;
  /** House desk inbox (NOTIFY_EMAIL, falling back to SMTP_USER). */
  houseEmail: string;
  /** Maps a bidder id to an email address, or null when unknown. */
  resolveWinnerEmail?: (bidderId: string) => Promise<string | null>;
  /** Injectable clock for tests. */
  now?: Date;
}

export type CloseNotifyOutcome = 'not_sold' | 'already_sent' | 'sent' | 'failed';

function formatMoneyMinor(minor: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(minor / 100);
  } catch {
    return `${currency} ${(minor / 100).toLocaleString('en-US')}`;
  }
}

function buildHouseText(lot: Lot, winnerNote: string): string {
  return [
    `Lot sold at the hammer.`,
    ``,
    `  Lot:      ${lot.title} (${lot.stoneRef || lot.id})`,
    `  Hammer:   ${formatMoneyMinor(lot.currentBidMinor, lot.currency)}`,
    `  Bids:     ${lot.bidCount}`,
    `  Closed:   ${lot.closesAt}`,
    `  Winner:   ${lot.currentBidderId} (${winnerNote})`,
    ``,
    `Settlement and Kimberley Process paperwork can now proceed from the dashboard.`,
  ].join('\n');
}

function buildWinnerText(lot: Lot): string {
  return [
    `Congratulations — you won ${lot.title}.`,
    ``,
    `  Lot:          ${lot.stoneRef || lot.id}`,
    `  Hammer price: ${formatMoneyMinor(lot.currentBidMinor, lot.currency)}`,
    `  Closed:       ${lot.closesAt}`,
    ``,
    `The house will contact you to arrange settlement and insured,`,
    `Kimberley Process certified delivery.`,
  ].join('\n');
}

export async function notifyLotClosed(
  store: AuctionStore,
  lot: Lot,
  deps: CloseNotifyDeps,
): Promise<CloseNotifyOutcome> {
  if (lot.status !== 'sold') return 'not_sold';
  if ((lot.closeNotifyStatus ?? '') === 'sent') return 'already_sent';

  // Re-read to narrow the duplicate-send window when two sweepers race: if a
  // sibling already marked this lot 'sent', bow out before touching SMTP.
  // (Exactly-once email is impossible; this makes duplicates a sub-second race
  // instead of a certainty, and the audit log records every attempt.)
  const fresh = await store.getLot(lot.id);
  if (!fresh || fresh.status !== 'sold') return 'not_sold';
  if ((fresh.closeNotifyStatus ?? '') === 'sent') return 'already_sent';

  const now = deps.now ?? new Date();
  const safeSend = async (msg: MailMessage): Promise<boolean> => {
    try {
      return await deps.sendMail(msg);
    } catch {
      return false;
    }
  };

  const failures: string[] = [];
  let winnerNote = 'no winner contact on record yet';

  try {
    const winnerEmail = deps.resolveWinnerEmail
      ? await deps.resolveWinnerEmail(lot.currentBidderId).catch(() => null)
      : null;

    if (deps.houseEmail) {
      const ok = await safeSend({
        to: deps.houseEmail,
        subject: `[AMES] Lot sold — ${lot.title}`,
        text: buildHouseText(lot, winnerEmail ?? winnerNote),
      });
      if (!ok) failures.push('house');
    }

    if (winnerEmail) {
      const ok = await safeSend({
        to: winnerEmail,
        subject: `[AMES] You won — ${lot.title}`,
        text: buildWinnerText(lot),
      });
      if (ok) {
        winnerNote = 'winner emailed';
      } else {
        failures.push('winner');
        winnerNote = 'winner email failed';
      }
    }

    if (failures.length > 0) {
      throw new Error(`close notification send failed: ${failures.join(', ')}`);
    }

    await store.updateLotCloseNotification(lot.id, { status: 'sent', error: '', at: now.toISOString() });
    await store.appendAudit({
      entity: 'lot',
      entityId: lot.id,
      action: 'lot.close_notified',
      actor: 'system',
      detail: JSON.stringify({ house: deps.houseEmail || 'unconfigured', winner: winnerNote }),
      createdAt: now.toISOString(),
    });
    return 'sent';
  } catch (error) {
    // Failure isolation: log, persist the failure for the next sweep, and
    // return normally — the close itself is already committed.
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[auction] close notification failed for lot ${lot.id}:`, message);
    try {
      await store.updateLotCloseNotification(lot.id, {
        status: 'failed',
        error: message.slice(0, 500),
        at: now.toISOString(),
      });
    } catch (stateError) {
      console.error(`[auction] could not persist notification failure for lot ${lot.id}:`, stateError);
    }
    try {
      await store.appendAudit({
        entity: 'lot',
        entityId: lot.id,
        action: 'lot.close_notify_failed',
        actor: 'system',
        detail: JSON.stringify({ error: message.slice(0, 500), failures, winner: winnerNote }),
        createdAt: now.toISOString(),
      });
    } catch (auditError) {
      console.error(`[auction] could not audit notification failure for lot ${lot.id}:`, auditError);
    }
    return 'failed';
  }
}
