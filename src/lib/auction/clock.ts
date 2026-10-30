/**
 * Server-clock helpers for the auction UI.
 *
 * Every auction API response carries `serverTime`. The client computes an
 * offset per fetch and renders all countdowns from the corrected clock:
 *
 *     serverNow ≈ Date.now() + offsetMs
 *
 * The client tick only affects what is DISPLAYED. Outcomes (open/close/sold)
 * are always decided server-side — by lazy close inside the bid engine's
 * transactional path and by the /api/cron/close-lots sweeper — so a wrong or
 * manipulated client clock can never win or extend an auction.
 */

/** Offset in ms such that serverNow ≈ clientNow + offset. 0 on bad input. */
export function computeOffsetMs(serverTimeIso: string, clientNowMs: number): number {
  const serverMs = Date.parse(serverTimeIso);
  if (!Number.isFinite(serverMs)) return 0;
  return serverMs - clientNowMs;
}

/** Current server time estimate. */
export function serverNowMs(offsetMs: number, clientNowMs: number = Date.now()): number {
  return clientNowMs + offsetMs;
}

/**
 * Compact countdown against the corrected clock:
 *   "> 24h"  -> "3d 5h"
 *   "<= 24h" -> "2h 14m 03s"
 *   past/invalid -> "Closed"
 */
export function formatCountdown(targetIso: string, nowMs: number): string {
  const diff = Date.parse(targetIso) - nowMs;
  if (!Number.isFinite(diff) || diff <= 0) return 'Closed';
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1000);
  if (h > 24) {
    const d = Math.floor(h / 24);
    return `${d}d ${h % 24}h`;
  }
  return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
}
