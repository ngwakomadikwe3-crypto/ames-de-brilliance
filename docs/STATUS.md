# AMES current state — honest assessment

_Last updated: Phase 1 of the real-auction programme. Written for review by Ngwako
Madikwe; owner-level decisions go to Same Thwabi._

## Branch topology (verified against full history)

- `main` and `recovery/ames-visual` **diverged at `fad2ca8`** (2026-09-08,
  "fix AMES splash and stone presentation").
- `main` is that point **plus one commit**: `145ab72` "Deploy AMES mobile-hardened
  engine viewer" (2026-09-25) — a 316-file rewrite.
- `recovery/ames-visual` is that point **plus 71 commits** of customer-facing,
  visual and security work.
- Nothing from recovery is contained in main. Recovery is a **read-only reference**;
  we port from it deliberately and never merge it.

## What main has

- Product shell at `/app`: Boutique / SAME chat / Media panels driven by AMES Engine
  content packs in `public/ames-engine/`.
- Auction room at `/` — **demo only**: 8 hardcoded lots, client-side bids, no
  backend. Being replaced for real in Phase 2.
- Staff dashboard (`/dashboard`: requests, stones, paste-in import, traders,
  jewelry onboarding), sourcing request flow, intelligence + reports, trader and
  model portals, HMAC session auth (`src/middleware.ts`).
- Appwrite backend with auto-provisioning, DeepSeek AI tools, Dify SAME chat,
  SMTP email, Vercel crons (ground report, compliance briefing).
- Clean `npm ci && next build`; packaged test suites pass under Node 22+.

## What main lacks (deleted in `145ab72` or never on main)

- Customer account system (`/account`, `CustomerState`, customer gateway API).
- Admin dashboard (`/admin`), favourites (`/favorites`), jeweller onboarding and
  verification (`/jewellers/*`), PWA support.
- `proxy.ts` same-origin / rate-limit security layer, Dify transport hardening
  (`dify.mjs`), buying-intelligence and jeweller-matching modules.
- Canonical stone GLBs (`public/models/canonical/`) with integrity manifest, the
  procedural `DiamondViewer`, splash experience and brand media.
- Recovery's 22-file test suite (106 tests) and its ops/validation scripts.

## Security posture — carried forward from recovery's NO-GO assessment

Recovery's own docs (deleted from main in `145ab72`) declared **NO-GO for a secure
MVP**. Those findings still stand and are recorded here so they are not lost:

1. The secure entitlement / signed asset-delivery milestone was **interrupted and
   never completed**. No entitlement authority exists on main.
2. The canonical photorealistic renderer was judged a **"simplified faceted
   preview"**, not approved optical transport — owner visual review outstanding.
3. No production jewelry catalogue or account persistence is wired to the engine
   surfaces (boutique/chat/media run on `dev-test-*` fixture packs).
4. `data/ames.db*` was committed to a **public** repository with trader PII and
   portal codes (see `docs/RUNBOOK_HISTORY_PURGE.md`; portal codes must be
   reissued regardless of the purge).
5. Media likes/comments/saves are device-local only.

## Phase 3 port list (from recovery, deliberately — no merge)

- `proxy.ts` same-origin + rate-limit protections, adapted to main's middleware.
- `/admin` dashboard and jeweller verification pipeline.
- `ReserveModal` and customer/favorites flows (behind bidder accounts).
- Recovery's test suites, adapted where the architecture matches.

## Launch position

**Not launch-ready.** Phase 2 (real auction backend), Phase 3 (bidder accounts,
compliance, security ports) and Phase 5 (hardening, GO/NO-GO checklist) must
complete first. Owner decisions (currency, payment rails, fees, seller policy,
legal/licensing confirmation for auctioning diamonds in Botswana) are tracked in
the programme plan and flagged per phase.
