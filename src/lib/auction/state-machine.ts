import type { LotStatus } from './types.ts';

/**
 * Lot lifecycle state machine. This table is the single source of truth;
 * every status change in the system (bids, lazy close, future cron) must go
 * through assertTransition().
 *
 *   draft     -> scheduled | withdrawn
 *   scheduled -> live | withdrawn
 *   live      -> closing | withdrawn
 *   closing   -> sold | unsold | withdrawn
 *   sold / unsold / withdrawn are terminal.
 *
 * Relisting an unsold lot is deliberately NOT a transition: create a new lot
 * so the bid history of the original stays immutable.
 */
export const LOT_TRANSITIONS: Record<LotStatus, readonly LotStatus[]> = {
  draft: ['scheduled', 'withdrawn'],
  scheduled: ['live', 'withdrawn'],
  live: ['closing', 'withdrawn'],
  closing: ['sold', 'unsold', 'withdrawn'],
  sold: [],
  unsold: [],
  withdrawn: [],
};

export const TERMINAL_STATUSES: readonly LotStatus[] = ['sold', 'unsold', 'withdrawn'];

export class InvalidTransitionError extends Error {
  readonly from: LotStatus;
  readonly to: LotStatus;
  constructor(from: LotStatus, to: LotStatus) {
    super(`invalid lot transition: ${from} -> ${to}`);
    this.name = 'InvalidTransitionError';
    this.from = from;
    this.to = to;
  }
}

export function canTransition(from: LotStatus, to: LotStatus): boolean {
  return LOT_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: LotStatus, to: LotStatus): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}

export function isTerminal(status: LotStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}
