import { sessionTokenFromCookieHeader, verifyStaffSession } from '../session.ts';
import { AppwriteBuyerStore } from './appwrite-store.ts';
import type { BuyerStore } from './store.ts';
import { buyerTokenFromCookieHeader, verifyBuyerSession } from './session.ts';
import { buyerMayOffer } from './service.ts';
import { BUYER_TERMS_VERSION } from './terms.ts';

/**
 * Catalogue access resolution (rough catalogue + offer platform).
 *
 * The catalogue is PRIVATE by default: CATALOGUE_PUBLIC_ACCESS is the
 * owner-controlled flag (renamed from the auction-era public-bidding flag,
 * default OFF). With the flag off, anonymous visitors get no catalogue
 * access at all; with it on, they get read-only browsing — offers always
 * require a verified buyer regardless of the flag.
 *
 * Resolution order per request:
 *   1. Staff session (adb_session with a role claim) — full access.
 *   2. Buyer session (adb_buyer) — the buyer row is RE-READ from Appwrite on
 *      every resolve: a suspension or a lapsed licence takes effect on the
 *      very next request, never after a cached grace period.
 *   3. Anonymous — canBrowse only when the public-access flag is on.
 */

/** True only for the exact opt-in value; everything else keeps the catalogue private. */
export function cataloguePublicAccessEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.CATALOGUE_PUBLIC_ACCESS === '1';
}

export type CatalogueAccess =
  | { kind: 'staff' }
  | {
      kind: 'buyer';
      buyerId: string;
      /** Staff-verified account (status === 'verified'). */
      verified: boolean;
      /** Current buyer terms accepted. */
      termsCurrent: boolean;
      /** All amendment-2 checks: verified + terms + licence fields + staff-verified + unexpired. */
      mayOffer: boolean;
    }
  | { kind: 'anonymous' };

export interface ResolvedCatalogueAccess {
  access: CatalogueAccess;
  /** May view the catalogue. Anonymous only with the flag ON. */
  canBrowse: boolean;
  /** May make offers. Always requires a fully verified buyer (flag-independent). */
  canOffer: boolean;
}

export async function resolveCatalogueAccess(
  cookieHeader: string | null,
  store?: BuyerStore,
  now: Date = new Date(),
): Promise<ResolvedCatalogueAccess> {
  // 1. Staff session.
  const staffToken = sessionTokenFromCookieHeader(cookieHeader);
  if (staffToken && (await verifyStaffSession(staffToken))) {
    return { access: { kind: 'staff' }, canBrowse: true, canOffer: false };
  }

  // 2. Buyer session — fresh row read every time.
  const session = await verifyBuyerSession(buyerTokenFromCookieHeader(cookieHeader));
  if (session) {
    const buyerStore = store ?? new AppwriteBuyerStore();
    const buyer = await buyerStore.getBuyer(session.buyerId);
    if (buyer && !buyer.anonymisedAt) {
      const access: CatalogueAccess = {
        kind: 'buyer',
        buyerId: buyer.id,
        verified: buyer.status === 'verified',
        termsCurrent: buyer.termsVersion === BUYER_TERMS_VERSION,
        mayOffer: buyerMayOffer(buyer, now),
      };
      // Browsing the private catalogue requires a verified buyer account;
      // offers require the full amendment-2 predicate.
      return { access, canBrowse: access.verified, canOffer: access.mayOffer };
    }
  }

  // 3. Anonymous — browsing only when the owner opens the catalogue publicly.
  return { access: { kind: 'anonymous' }, canBrowse: cataloguePublicAccessEnabled(), canOffer: false };
}
