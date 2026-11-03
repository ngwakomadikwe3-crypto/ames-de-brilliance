# AMES current state — honest assessment

_Last updated: 2026-11-03, after the rough-diamond direction change. Written
for review by Ngwako Madikwe; owner-level decisions go to Same Thwabi._

## Direction (2026-10-31, supersedes all auction-era planning)

AMES launches as a **rough diamond catalogue and offer platform for licensed
buyers** — NOT an auction. The auction engine (PRs #26 and #28) stays
**unrouted and disabled and must not be extended**. Known step map:

- **STEP 2** — rough diamond listings and lot compliance records, plus the
  optional single-file GLB lot model (direct-to-storage upload, short-lived
  signed URLs).
- **STEP 5** — UI: rough catalogue homepage (replaces the demo auction room),
  buyer screens, staff/owner dashboard.
- There is no hardening/GO-NO-GO step in the current plan.

## Branch topology (verified against full history)

- `main` and `recovery/ames-visual` **diverged at `fad2ca8`** (2026-09-08).
- `main` is that point plus one commit: `145ab72` "Deploy AMES
  mobile-hardened engine viewer" (2026-09-25) — a 316-file rewrite.
- `recovery/ames-visual` is that point plus 71 commits of customer-facing,
  visual and security work. It is a **read-only reference**; we port from it
  deliberately and never merge it.

## Programme status (2026-11-02)

| PR | Scope | State |
|---|---|---|
| #25 | Repo hygiene, SAME chat fix, honest status docs (base `main`) | Open |
| #26, #28 | Auction engine + UI — **do not merge or extend** | Open, disabled |
| #27 | Permissions lockdown on the auction stack — ported as #30 | Superseded |
| #29 | Bidder accounts on the auction stack — rebuilt as #31 | Superseded |
| #30 | Server-only permissions for every collection/bucket; reconcile gate (`APPWRITE_RECONCILE_PERMISSIONS=1`, default OFF) + `scripts/reconcile-permissions.mjs` (dry-run default, `--apply` snapshots rollback first, `--restore`); domain-separated HMAC signing; `REPORT_SHARE_SECRET` required in production | Open, staged |
| #31 | Buyer accounts (OTP login, KYC documents, staff review, terms, export/anonymisation) on the catalogue stack; unique `buyers.email` + race-safe registration; OTP refuses production without SMTP; licence expiry as an inclusive Africa/Gaborone calendar date; `docs/ci-workflow.yml` for manual CI install | Open, staged |
| #32 | STEP 1 carry-over fixes: `middleware.ts` → `proxy.ts` rename (Next 16 convention; proxy runs on the Node.js runtime, not Edge), this STATUS rewrite, registration/login anti-enumeration, server-side public-access flag guard. package-lock regeneration is NOT in the PR — Ngwako regenerates locally on Node 22 | In review |
| #33 | `scripts/verify-lockdown.mjs` — keyless outside-in lockdown proof (56 GET-only probes from the app's own constants, both Databases and TablesDB route families; populated-2xx FAIL, empty-2xx UNPROVEN, not-provisioned tracked separately with `--expect-provisioned`, sentinel file fetch informational only) + unit tests + runbook section below | In review |

## Binding product amendments (STEP 0, approved 2026-10-31)

1. Publishing is **owner-only**; staff prepare and submit.
2. Buyer licence number/type/expiry are required, staff-verified; expired
   licence blocks offers. Seller licence per lot; expired blocks publication.
3. Deal flow: `invoiced` → `paid` (manual staff marking, configurable fees,
   no payment gateway) before `shipped`; no ship/complete without `paid`.
4. Offer acceptance is race-safe and atomic, with an owner-only acceptance
   threshold.
5. Amounts are integer minor units + ISO currency code; currency is per-lot
   with no hardcoded default.
6. Editing material lot fields after approval returns the lot to
   `pending_review`. Deals supersede orders; orders become read-only legacy.
7. Offer expiry: lazy check on read + a daily sweeper.
8. 3D: single-file GLB only, direct-to-storage, short-lived signed URLs.
9. Bidder → buyer rename; authz matrix, IDOR, OTP and flag tests carried
   over unweakened. `CATALOGUE_PUBLIC_ACCESS` (default off) replaces the
   auction-era public-bidding flag.

## STEP 1 carry-over fixes (lettering per Ngwako, 2026-11-02)

- (a) Unique `buyers.email` + race-safe registration — **done** (PR #31).
- (b) OTP login refuses to run in production without SMTP — **done** (PR #31).
- (c) Registration and login return identical responses for known and
  unknown emails, with a test — **done** (carry-over PR).
- (d) Staff data export includes the buyer's offers and audit entries —
  **deferred**: impossible before offers exist; recorded as an acceptance
  criterion for the offers/deals work below.
- (e) `CATALOGUE_PUBLIC_ACCESS` is read server-side on every request and is
  never a `NEXT_PUBLIC` variable, with a test — **done** (carry-over PR).

## Verifying the Appwrite lockdown (scripts/verify-lockdown.mjs)

`scripts/verify-lockdown.mjs` proves the server-only lockdown from the
OUTSIDE: given only `APPWRITE_ENDPOINT` and `APPWRITE_PROJECT_ID` (no API
key, no session), it tries to list documents/rows in every collection via
BOTH the legacy Databases route and the TablesDB route, and to list files
in every bucket. The collection/bucket names come from the same
`COLLECTION_DEFS` / `BUCKET_DEFS` / `DB_ID` constants in
`src/lib/appwrite.ts`, so the probe set cannot drift from the provisioned
schema. Read-only: GET requests only. A direct file fetch per bucket with
a sentinel id is also made, but it is **informational only** — a 404 for a
nonexistent file id cannot distinguish a locked bucket from an open one,
so it is excluded from the pass criteria.

    APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1 \
    APPWRITE_PROJECT_ID=<project id> \
    node --experimental-strip-types scripts/verify-lockdown.mjs [--expect-provisioned]

Verdicts: a 2xx WITH rows/files is FAIL; a 2xx with `total: 0` is UNPROVEN
(an empty list cannot distinguish protection from an empty resource);
401/403 is refused; a 404 whose Appwrite error `type` is a recognised
resource-not-found (`table_not_found`, `collection_not_found`,
`database_not_found`, `storage_bucket_not_found`, …) is reported separately
as **not provisioned** with a per-route-family count; `project_not_found`
or any unrecognised/unparseable 404 body, any other status, or a network
error is INCONCLUSIVE — a mistyped project ID can never produce a PASS.
Exit codes: 0 = PASS, 1 = FAIL, 2 = UNPROVEN/INCONCLUSIVE.
`--expect-provisioned` turns every not-provisioned resource into a FAIL
(use it once the schema is meant to exist).

Procedure around reconciliation:

1. **Seed first.** Before running the verifier, put one row in every
   collection and one file in every bucket (a staging project; trivial
   placeholder content is fine). Without this, an open-but-empty resource
   reports UNPROVEN rather than FAIL.
2. **Positive control.** On staging, create one throwaway collection and
   one throwaway bucket with `read("any")` plus one row and one file, and
   add them temporarily to `COLLECTION_DEFS`/`BUCKET_DEFS` — or simply
   probe them by hand with curl using the same keyless headers. Run the
   verifier: it MUST report FAIL naming the throwaway resources (and the
   curl probes must return 2xx with the seeded content). Then delete the
   throwaway collection and bucket and revert the temporary constant
   edits. A verifier run that has never caught an open resource proves
   nothing.
3. Run the verifier BEFORE `node scripts/reconcile-permissions.mjs
   --apply` (expect FAIL listing every open collection/bucket on a legacy
   project) and again AFTER `--apply` (expect PASS).

## STEP d1 — the rough catalogue (branch `feat/lots-catalogue`, in review)

The customer-visible catalogue half of STEP 2 + the STEP 5 homepage.

**Schema (server-only, permissions `[]` like every other table):**

- Tables `lots` and `lot_compliance` (unique index `lots_lot_no` is the
  authoritative duplicate guard; `lots_state` supports the catalogue query).
- Buckets `lot-photos` (jpeg/png/webp, 20 MB), `lot-compliance`
  (pdf/jpeg/png/webp, 20 MB, private — buyers never see these), `lot-models`
  (GLB only, 100 MB ceiling). All three are probed by
  `scripts/verify-lockdown.mjs` automatically — the probe set derives from
  the same `COLLECTION_DEFS`/`BUCKET_DEFS` constants.

**State machine (amendments 1, 2, 6):** `draft → pending_review → approved →
published`, plus `withdrawn` and `reopen`. Approve/reject/publish/withdraw
are **owner-only** (staff prepare and submit). Submit requires every
material field, a valid price (integer minor units + ISO 4217 alphabetic
code, per lot, no default — amendment 5), a complete seller licence, and at
least one photo. Publishing is refused while the seller licence is expired
(inclusive Africa/Gaborone calendar date — amendment 2). Editing a material
field of an approved/published lot demotes it to `pending_review` and a
published lot leaves the catalogue immediately (amendment 6; photo and model
changes are material).

**Access and price visibility:** `/api/lots` serves published lots only, to
staff and verified buyers always, to anonymous visitors only when
`CATALOGUE_PUBLIC_ACCESS=1` (server-side, read per request). Prices are in
the payload ONLY for staff and verified buyers (`maySeeLotPrice` — single
tested predicate). Unpublished lots are invisible to the catalogue API
(404, existence not leaked). Lot photos proxy through
`/api/lots/[id]/photo/[fileId]`, which binds the file id to the lot (no
IDOR) and requires browse access.

**3D models (amendment 8, with one flagged deviation):** single-file GLB
only, magic bytes + glTF version checked server-side, size cap
`LOT_MODEL_MAX_BYTES` (default 50 MB, ceiling 100 MB). Viewing: 5-minute
HMAC-signed URLs (purpose `lot-model-link`) binding lot, current file id,
viewer and expiry; replacing the model kills outstanding links. Policy
`LOT_MODEL_ACCESS`: `verified` (default — verified buyers and staff, every
served view audited BEFORE the bytes stream) or `browsers`.
**Deviation from the letter of amendment 8 ("direct-to-storage upload"),
flagged for review:** the buckets are server-only (PR #30 lockdown), the app
has no Appwrite Auth user sessions, and Appwrite offers no presigned-upload
mechanism — a browser cannot write to storage directly. Uploads are instead
server-mediated through a 2-minute single-purpose HMAC ticket
(`lot-upload-ticket`, minted per lot per staff actor). Lots without a model
render photos-only.

**Compliance documents:** KP certificates, origin declarations, valuations,
assays. Magic-byte sniffed at upload (filename/MIME never trusted), bytes in
the private bucket, staff view via 5-minute signed links
(`lot-compliance-link`); every served view is audited first.

**Surfaces:** `/` is now the rough catalogue homepage (replacing the demo
auction room — same dark/platinum visual language, no auction wording, no
demo lots, no jewellery); `/lots/[id]` is the lot detail (photos-first, 3D
on demand); `/dashboard` gains a **Lots** tab for owner/staff with the full
lifecycle, media and compliance management. Staff and owner see identical
screens except that approve/reject/publish/withdraw controls render for the
owner only (the server re-checks regardless).

**Audit:** every create/edit/transition/photo/model/compliance action and
every restricted model or document view lands in the shared `audit_log`
table with the `lot.*` action vocabulary.

**Owner decisions flagged for Same Thwabi:** (1) price visibility default =
staff + verified buyers only, anonymous browsers never; (2) withdrawal is
owner-only, not just publishing; (3) the server-mediated upload deviation
above; (4) `LOT_MODEL_ACCESS` default `verified`.

**Tests:** `scripts/test-ames-lots.mjs` — 23 tests over the memory store and
the pure functions (state machine, owner-only enforcement, expired-licence
publish refusal, amendment-6 demotion, price stripping, GLB sniffing, link
and ticket tamper/expiry, catalogue access gating).

## Acceptance criteria for the offers/deals work (STEP 2, not started)

- Staff data export for a buyer includes that buyer's **offers and audit
  entries** (carry-over item (d) — could not be built before offers exist).
- Concurrent-offer-acceptance test; the Appwrite concurrency mechanism used
  must be reported and confirmed against the deployed server version.
- Licence gates (amendment 2) enforced server-side on every offer.

## Security posture — carried forward from recovery's NO-GO assessment

Recovery's own docs (deleted from main in `145ab72`) declared **NO-GO for a
secure MVP**. Those findings still stand:

1. The secure entitlement / signed asset-delivery milestone was interrupted
   and never completed. No entitlement authority exists on main.
2. The canonical photorealistic renderer was judged a "simplified faceted
   preview", not approved optical transport — owner visual review outstanding.
3. No production jewelry catalogue or account persistence is wired to the
   engine surfaces (boutique/chat/media run on `dev-test-*` fixture packs).
4. `data/ames.db*` was committed to a public repository with trader PII and
   portal codes (see `docs/RUNBOOK_HISTORY_PURGE.md`; portal codes must be
   reissued regardless of the purge).
5. Media likes/comments/saves are device-local only.

## What main has

- Product shell at `/app`: Boutique / SAME chat / Media panels driven by AMES
  Engine content packs in `public/ames-engine/`.
- Auction room at `/` — **demo only**: 8 hardcoded lots, client-side bids, no
  backend. **Replaced on `feat/lots-catalogue`** (STEP d1): `/` becomes the
  rough catalogue homepage, live from the `lots` table, no auction wording or
  demo lots. The real auction engine built on branches (#26/#28) is disabled
  and will not ship.
- Staff dashboard (`/dashboard`: requests, stones, paste-in import, traders,
  jewelry onboarding), sourcing request flow, intelligence + reports, trader
  and model portals, HMAC session auth (`src/proxy.ts` — the Next 16
  convention formerly `middleware.ts`; proxy runs on the **Node.js runtime
  only** and the runtime is not configurable — it is NOT the Edge runtime
  `middleware.ts` ran on. Nothing in `src/proxy.ts` or its imports depends
  on Edge-only behaviour: every API used (Web Crypto, `atob`/`btoa`, `URL`,
  `NextRequest`/`NextResponse`) behaves identically on Node 22).
- Appwrite backend with auto-provisioning, DeepSeek AI tools, Dify SAME chat,
  SMTP email, Vercel crons (ground report, compliance briefing).
- Clean `npm ci && next build`; packaged test suites pass under Node 22+.

## What main still lacks (deleted in `145ab72` or never on main)

- Customer account system (`/account`), admin dashboard (`/admin`),
  favourites, jeweller onboarding/verification, PWA support.
- Recovery's test suites and ops/validation scripts.
- Canonical stone GLBs with integrity manifest, procedural `DiamondViewer`,
  splash experience and brand media.

## Phase 3 port list (from recovery, deliberately — no merge)

- `proxy.ts` same-origin + rate-limit protections — **ported** (PR #29/#31
  middleware, adapted to main).
- `/admin` dashboard and jeweller verification pipeline — outstanding.
- Recovery's test suites, adapted where the architecture matches — partial.

## Launch position

**Not launch-ready.** STEP 2's offers/deals half (d2) must complete first —
the lots catalogue (d1) is built and in review on `feat/lots-catalogue`.
Owner decisions (currency per lot,
payment rails and fee model for invoiced/paid, seller policy, legal/licensing
confirmation for selling rough diamonds in Botswana, cousin-role PII access,
buyer terms text, data-retention defaults) are flagged per PR for Same
Thwabi and counsel.
