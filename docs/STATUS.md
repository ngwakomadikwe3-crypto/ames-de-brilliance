# AMES current state — honest assessment

_Last updated: 2026-11-02, after the rough-diamond direction change. Written
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
| (next) | STEP 1 carry-over fixes: lockfile regeneration, this STATUS rewrite, registration/login anti-enumeration, server-side public-access flag guard | In review |

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
  backend. STEP 5 replaces it with the rough catalogue homepage. The real
  auction engine built on branches (#26/#28) is disabled and will not ship.
- Staff dashboard (`/dashboard`: requests, stones, paste-in import, traders,
  jewelry onboarding), sourcing request flow, intelligence + reports, trader
  and model portals, HMAC session auth (`src/proxy.ts`, the Next 16 convention
  formerly `middleware.ts`).
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

**Not launch-ready.** STEP 2 (lots, compliance, offers, deals) and STEP 5
(catalogue UI) must complete first. Owner decisions (currency per lot,
payment rails and fee model for invoiced/paid, seller policy, legal/licensing
confirmation for selling rough diamonds in Botswana, cousin-role PII access,
buyer terms text, data-retention defaults) are flagged per PR for Same
Thwabi and counsel.
