import { licenceCurrentOn, todayInGaborone, isValidLicenceDate } from '../buyers/licence.ts';
import type { CatalogueAccess } from '../buyers/access.ts';
import { canPublishLots } from './authz.ts';
import type { LotStore } from './store.ts';
import { DuplicateLotNoError, LotTransitionError } from './types.ts';
import type { Lot, LotMaterialField, LotState } from './types.ts';
import { LOT_MATERIAL_FIELDS } from './types.ts';

/**
 * Lot lifecycle service: creation, editing, the state machine and the
 * catalogue read shapes. Routes are thin wrappers over these functions; the
 * lot test suite exercises them directly against the memory store.
 *
 * State machine (amendments 1 + 2 + 6):
 *
 *   draft ──submit──▶ pending_review ──approve──▶ approved ──publish──▶ published
 *     ▲                   │                          │                     │
 *     │                   └──reject──▶ draft         └──withdraw──▶ withdrawn ◀──┘
 *     │◀─reopen───────────────────────────────────────────────────────┘
 *
 * - submit: owner or staff, from draft (or re-submit from draft after a
 *   reject); the lot must pass lotReadyForReview.
 * - approve / reject: owner only, from pending_review; reject requires a
 *   reason and returns the lot to draft.
 * - publish: owner only, from approved; REFUSED while the seller licence is
 *   expired (amendment 2 — inclusive Africa/Gaborone calendar date).
 * - withdraw: owner only, from approved or published; requires a reason.
 * - reopen: owner or staff, from withdrawn, back to draft.
 * - Editing a MATERIAL field of an approved or published lot demotes it to
 *   pending_review (amendment 6) — a published lot leaves the catalogue the
 *   moment its material facts change, until the owner re-approves and
 *   re-publishes.
 */

/* ── Validation ── */

/** ISO 4217 alphabetic code, uppercase (e.g. USD, BWP, ZAR). */
export const ISO_CURRENCY_RE = /^[A-Z]{3}$/;

export function isValidCurrency(code: string): boolean {
  return ISO_CURRENCY_RE.test(code);
}

/** Integer minor units (amendment 5): safe integer, non-negative. */
export function isValidMinorUnits(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

export const LOT_NO_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,49}$/;

export interface LotDraftInput {
  /** Row id — the route mints it (Appwrite ID.unique()); tests inject their own. */
  id: string;
  lotNo: string;
  title: string;
  description?: string;
  origin?: string;
  caratTotal?: number;
  stonesCount?: number;
  colour?: string;
  clarity?: string;
  crystalForm?: string;
  priceMinor?: number;
  currency?: string;
  sellerLicenceNumber?: string;
  sellerLicenceType?: string;
  sellerLicenceExpiry?: string;
}

function clean(value: string | undefined, max: number): string {
  return (value ?? '').trim().slice(0, max);
}

/**
 * Create a draft lot. Only lotNo and title are required at draft stage —
 * staff can park a half-described lot and finish it before submitting.
 * Throws DuplicateLotNoError when the stock reference is taken.
 */
export async function createLot(
  store: LotStore,
  input: LotDraftInput,
  staffActor: string,
  now = new Date(),
): Promise<Lot> {
  const lotNo = clean(input.lotNo, 50);
  const title = clean(input.title, 255);
  if (!LOT_NO_RE.test(lotNo)) {
    throw new LotTransitionError('invalid lot number', 'incomplete', { field: 'lotNo' });
  }
  if (!title) {
    throw new LotTransitionError('title is required', 'incomplete', { field: 'title' });
  }
  if (await store.getLotByNo(lotNo)) throw new DuplicateLotNoError(lotNo);

  const ts = now.toISOString();
  const lot: Lot = {
    id: input.id,
    lotNo,
    title,
    description: clean(input.description, 5000),
    origin: clean(input.origin, 100),
    caratTotal: typeof input.caratTotal === 'number' && input.caratTotal > 0 ? input.caratTotal : 0,
    stonesCount: Number.isSafeInteger(input.stonesCount) && (input.stonesCount ?? 0) > 0 ? (input.stonesCount as number) : 0,
    colour: clean(input.colour, 100),
    clarity: clean(input.clarity, 100),
    crystalForm: clean(input.crystalForm, 100),
    priceMinor: isValidMinorUnits(input.priceMinor ?? NaN) ? (input.priceMinor as number) : 0,
    currency: clean(input.currency, 3).toUpperCase(),
    sellerLicenceNumber: clean(input.sellerLicenceNumber, 255),
    sellerLicenceType: clean(input.sellerLicenceType, 100),
    sellerLicenceExpiry: clean(input.sellerLicenceExpiry, 50),
    state: 'draft',
    stateReason: '',
    photoFileIds: [],
    modelFileId: '',
    createdBy: staffActor,
    approvedBy: '',
    approvedAt: '',
    publishedBy: '',
    publishedAt: '',
    createdAt: ts,
    updatedAt: ts,
  };
  validateSellerLicence(lot);
  await store.createLot(lot);
  await audit(store, lot.id, 'lot.created', staffActor, { lotNo: lot.lotNo }, now);
  return lot;
}

/** Seller licence fields must be complete or all-empty, and dates valid. */
function validateSellerLicence(lot: Lot): void {
  const any = lot.sellerLicenceNumber || lot.sellerLicenceType || lot.sellerLicenceExpiry;
  if (!any) return;
  if (lot.sellerLicenceExpiry && !isValidLicenceDate(lot.sellerLicenceExpiry)) {
    throw new LotTransitionError('seller licence expiry must be a real YYYY-MM-DD date', 'incomplete', {
      field: 'sellerLicenceExpiry',
    });
  }
}

/**
 * Completeness gate for submit (draft → pending_review): every material
 * field filled, price in valid minor units with an ISO currency (amendment
 * 5, no default), seller licence complete with a valid date (amendment 2),
 * and at least one photo. Returns the list of problems ('' = ready).
 */
export function lotReviewProblems(lot: Lot): string[] {
  const problems: string[] = [];
  if (!lot.title) problems.push('title');
  if (!lot.origin) problems.push('origin');
  if (!(lot.caratTotal > 0)) problems.push('caratTotal');
  if (!(lot.stonesCount > 0)) problems.push('stonesCount');
  if (!lot.colour) problems.push('colour');
  if (!lot.clarity) problems.push('clarity');
  if (!lot.crystalForm) problems.push('crystalForm');
  if (!isValidMinorUnits(lot.priceMinor) || lot.priceMinor <= 0) problems.push('priceMinor');
  if (!isValidCurrency(lot.currency)) problems.push('currency');
  if (!lot.sellerLicenceNumber) problems.push('sellerLicenceNumber');
  if (!lot.sellerLicenceType) problems.push('sellerLicenceType');
  if (!isValidLicenceDate(lot.sellerLicenceExpiry)) problems.push('sellerLicenceExpiry');
  if (lot.photoFileIds.length === 0) problems.push('photos');
  return problems;
}

/** True when the seller licence is current today in Africa/Gaborone. */
export function sellerLicenceCurrent(lot: Lot, now: Date = new Date()): boolean {
  return licenceCurrentOn(lot.sellerLicenceExpiry, todayInGaborone(now));
}

/* ── Editing (amendment 6 demotion) ── */

const STRING_FIELDS: Record<string, number> = {
  lotNo: 50, title: 255, description: 5000, origin: 100, colour: 100, clarity: 100,
  crystalForm: 100, currency: 3, sellerLicenceNumber: 255, sellerLicenceType: 100,
  sellerLicenceExpiry: 50,
};

/**
 * Coerce a JSON request body into a material-field patch. Unknown keys are
 * ignored; present keys with the wrong TYPE are a 400-class error (never
 * silently coerced). Pure — the routes and the tests share it.
 */
export function sanitizeLotPatch(body: unknown): Partial<Pick<Lot, LotMaterialField>> {
  if (!body || typeof body !== 'object') {
    throw new LotTransitionError('body must be an object', 'incomplete');
  }
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (!(LOT_MATERIAL_FIELDS as readonly string[]).includes(key)) continue;
    if (key in STRING_FIELDS) {
      if (typeof value !== 'string') {
        throw new LotTransitionError(`${key} must be a string`, 'incomplete', { field: key });
      }
      const cleaned = value.trim().slice(0, STRING_FIELDS[key]);
      patch[key] = key === 'currency' ? cleaned.toUpperCase() : cleaned;
    } else if (key === 'caratTotal' || key === 'priceMinor' || key === 'stonesCount') {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        throw new LotTransitionError(`${key} must be a non-negative number`, 'incomplete', { field: key });
      }
      if (key !== 'caratTotal' && !Number.isSafeInteger(value)) {
        throw new LotTransitionError(`${key} must be an integer`, 'incomplete', { field: key });
      }
      patch[key] = value;
    } else if (key === 'photoFileIds') {
      if (!Array.isArray(value) || value.some((v) => typeof v !== 'string' || v.length === 0 || v.length > 100)) {
        throw new LotTransitionError('photoFileIds must be an array of file ids', 'incomplete', { field: key });
      }
      patch[key] = value.slice(0, 50);
    } else if (key === 'modelFileId') {
      if (typeof value !== 'string' || value.length > 100) {
        throw new LotTransitionError('modelFileId must be a file id string', 'incomplete', { field: key });
      }
      patch[key] = value;
    }
  }
  return patch as Partial<Pick<Lot, LotMaterialField>>;
}

/**
 * Apply an edit. When any MATERIAL field actually changes value and the lot
 * is approved or published, the lot demotes to pending_review (amendment 6):
 * its material facts changed after approval, so it must be reviewed again —
 * and a published lot leaves the catalogue immediately. Identical-value
 * edits never demote. Every edit is audited with the list of changed fields.
 */
export async function editLot(
  store: LotStore,
  lotId: string,
  patch: Partial<Pick<Lot, LotMaterialField>>,
  staffActor: string,
  now = new Date(),
): Promise<Lot> {
  const lot = await store.getLot(lotId);
  if (!lot) throw new LotTransitionError('lot not found', 'not_found');

  const changed: LotMaterialField[] = [];
  for (const field of LOT_MATERIAL_FIELDS) {
    if (!(field in patch)) continue;
    const next = patch[field];
    const prev = lot[field];
    const same = Array.isArray(next) && Array.isArray(prev)
      ? next.length === prev.length && next.every((v, i) => v === prev[i])
      : next === prev;
    if (!same) changed.push(field);
  }

  const update: Partial<Lot> = { updatedAt: now.toISOString() };
  if (changed.length > 0) {
    for (const field of changed) {
      (update as Record<string, unknown>)[field] = patch[field];
    }
    const candidate = { ...lot, ...update } as Lot;
    validateSellerLicence(candidate);
    if (candidate.currency && !isValidCurrency(candidate.currency)) {
      throw new LotTransitionError('currency must be an ISO 4217 alphabetic code', 'incomplete', { field: 'currency' });
    }
    if (!isValidMinorUnits(candidate.priceMinor)) {
      throw new LotTransitionError('price must be integer minor units', 'incomplete', { field: 'priceMinor' });
    }
    if (!LOT_NO_RE.test(candidate.lotNo)) {
      throw new LotTransitionError('invalid lot number', 'incomplete', { field: 'lotNo' });
    }
    if (changed.includes('lotNo')) {
      const clash = await store.getLotByNo(candidate.lotNo);
      if (clash && clash.id !== lotId) throw new DuplicateLotNoError(candidate.lotNo);
    }
    if (lot.state === 'approved' || lot.state === 'published') {
      update.state = 'pending_review';
      update.stateReason = '';
    }
  }

  await store.updateLot(lotId, update);
  await audit(store, lotId, 'lot.updated', staffActor, { changed }, now);
  const fresh = await store.getLot(lotId);
  return fresh as Lot;
}

/* ── State machine ── */

export type LotTransitionAction = 'submit' | 'approve' | 'reject' | 'publish' | 'withdraw' | 'reopen';

const TRANSITION_TARGET: Record<LotTransitionAction, LotState> = {
  submit: 'pending_review',
  approve: 'approved',
  reject: 'draft',
  publish: 'published',
  withdraw: 'withdrawn',
  reopen: 'draft',
};

const TRANSITION_AUDIT: Record<LotTransitionAction, string> = {
  submit: 'lot.submitted',
  approve: 'lot.approved',
  reject: 'lot.rejected',
  publish: 'lot.published',
  withdraw: 'lot.withdrawn',
  reopen: 'lot.reopened',
};

const TRANSITION_FROM: Record<LotTransitionAction, readonly LotState[]> = {
  submit: ['draft'],
  approve: ['pending_review'],
  reject: ['pending_review'],
  publish: ['approved'],
  withdraw: ['approved', 'published'],
  reopen: ['withdrawn'],
};

/** Owner-only actions (amendment 1); staff prepare and submit. */
const OWNER_ONLY_ACTIONS: readonly LotTransitionAction[] = ['approve', 'reject', 'publish', 'withdraw'];

export async function transitionLot(
  store: LotStore,
  lotId: string,
  action: LotTransitionAction,
  staffRole: string | null,
  staffActor: string,
  reason: string,
  now = new Date(),
): Promise<Lot> {
  const lot = await store.getLot(lotId);
  if (!lot) throw new LotTransitionError('lot not found', 'not_found');

  if (OWNER_ONLY_ACTIONS.includes(action) && !canPublishLots(staffRole)) {
    throw new LotTransitionError(`${action} is owner-only`, 'role_denied');
  }
  if (!TRANSITION_FROM[action].includes(lot.state)) {
    throw new LotTransitionError(`cannot ${action} a lot in state ${lot.state}`, 'illegal_transition');
  }
  if ((action === 'reject' || action === 'withdraw') && reason.trim().length < 3) {
    throw new LotTransitionError(`${action} requires a reason`, 'reason_required');
  }
  if (action === 'submit') {
    const problems = lotReviewProblems(lot);
    if (problems.length > 0) {
      throw new LotTransitionError('lot is not ready for review', 'incomplete', { problems });
    }
  }
  if (action === 'publish' && !sellerLicenceCurrent(lot, now)) {
    // Amendment 2: an expired seller licence blocks publication.
    throw new LotTransitionError('seller licence is expired — publication refused', 'seller_licence_expired');
  }

  const ts = now.toISOString();
  const update: Partial<Lot> = {
    state: TRANSITION_TARGET[action],
    stateReason: action === 'reject' || action === 'withdraw' ? reason.trim() : '',
    updatedAt: ts,
  };
  if (action === 'approve') {
    update.approvedBy = staffActor;
    update.approvedAt = ts;
  }
  if (action === 'publish') {
    update.publishedBy = staffActor;
    update.publishedAt = ts;
  }
  await store.updateLot(lotId, update);
  await audit(store, lotId, TRANSITION_AUDIT[action], staffActor, { action, reason: reason.trim() || undefined }, now);
  const fresh = await store.getLot(lotId);
  return fresh as Lot;
}

/* ── Catalogue read shapes ── */

/**
 * The price-visibility rule (single tested predicate; owner decision flagged
 * for Same Thwabi): prices are shown to staff and to VERIFIED buyers only.
 * Anonymous visitors — even when CATALOGUE_PUBLIC_ACCESS=1 lets them browse —
 * never see prices. Unverified buyers cannot browse at all (access.ts), so
 * they never reach this predicate with a price visible.
 */
export function maySeeLotPrice(access: CatalogueAccess): boolean {
  if (access.kind === 'staff') return true;
  if (access.kind === 'buyer') return access.verified;
  return false;
}

export interface CatalogueLotView {
  id: string;
  lotNo: string;
  title: string;
  description: string;
  origin: string;
  caratTotal: number;
  stonesCount: number;
  colour: string;
  clarity: string;
  crystalForm: string;
  /** Proxy paths, display order; the route binds each file id to the lot. */
  photos: string[];
  /** True when a GLB model exists; the client mints a signed URL to view it. */
  hasModel: boolean;
  publishedAt: string;
  /** Present ONLY when maySeeLotPrice(access) — stripped otherwise. */
  priceMinor?: number;
  currency?: string;
}

/** Shape a published lot for the catalogue; price fields stripped per the predicate. */
export function toCatalogueView(lot: Lot, access: CatalogueAccess): CatalogueLotView {
  const view: CatalogueLotView = {
    id: lot.id,
    lotNo: lot.lotNo,
    title: lot.title,
    description: lot.description,
    origin: lot.origin,
    caratTotal: lot.caratTotal,
    stonesCount: lot.stonesCount,
    colour: lot.colour,
    clarity: lot.clarity,
    crystalForm: lot.crystalForm,
    photos: lot.photoFileIds.map((fileId) => `/api/lots/${lot.id}/photo/${fileId}`),
    hasModel: lot.modelFileId.length > 0,
    publishedAt: lot.publishedAt,
  };
  if (maySeeLotPrice(access)) {
    view.priceMinor = lot.priceMinor;
    view.currency = lot.currency;
  }
  return view;
}

/** Staff list shape — everything the dashboard needs, including state. */
export function toStaffView(lot: Lot): Lot {
  return { ...lot, photoFileIds: [...lot.photoFileIds] };
}

async function audit(
  store: LotStore,
  lotId: string,
  action: string,
  actor: string,
  detail: Record<string, unknown>,
  now: Date,
): Promise<void> {
  await store.appendAudit({
    entity: 'lot',
    entityId: lotId,
    action,
    actor,
    detail: JSON.stringify(detail),
    createdAt: now.toISOString(),
  });
}
