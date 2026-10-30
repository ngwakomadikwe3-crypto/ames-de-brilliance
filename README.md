# AMES DE BRILLIANTE

B2B diamond sourcing, boutique and auction platform for a licensed diamond dealer in
Botswana. Next.js 16 (App Router) + React 19 + TypeScript + Tailwind v4, deployed on
Vercel, with Appwrite as the data and storage backend and the SAME concierge chat
powered by a Dify chatflow.

## Requirements

- Node.js 22 or newer (see `.nvmrc`; the test runner uses `--experimental-strip-types`)
- An Appwrite project (cloud or self-hosted) with a server API key

## Quick start

```bash
npm ci
cp .env.example .env.local   # fill in your values
npm run dev                  # http://localhost:3000
```

The Appwrite database, collections and buckets are provisioned automatically on first
run by `src/lib/appwrite.ts` (`ensureReady`). `schema.sql` is a human-readable
reference for that schema only — it is not runnable SQL.

## Architecture

- **Data & files:** Appwrite (`node-appwrite`) — requests, stones, traders, staff,
  chats, intelligence, jewelry products and media live in the `ames` database and
  media buckets. There is no local database.
- **SAME chat:** `/api/ames` proxies the Dify chatflow. Chat history persists in
  Appwrite via `/api/chats`. Replies can carry a typed `viewer_action`, validated
  against the active AMES Engine chat contract before the 3D stage executes it.
- **3D jewellery:** `@google/model-viewer` for pack assets plus the vendored AMES
  Engine (`vendor/ames-engine-0.1.0.tgz`, a local `file:` dependency) for the
  reference ring viewer. Engine asset packs are synced into `public/ames-engine/`
  from a verified engine checkout — see `scripts/sync-ames-*.mjs`.
- **Auth:** HMAC-signed session cookie (`adb_session`, 8 h) checked in
  `src/middleware.ts` for `/dashboard`, `/api/requests` and `/api/traders`. Staff
  accounts live in Appwrite; optional emergency owner/cousin codes come from the
  environment only.
- **AI tools:** DeepSeek-compatible API (`src/lib/ai.ts`) for parsing sourcing
  requests, drafting replies/offers and bulk stock import.
- **Email:** SMTP via nodemailer.

## Environment variables

See `.env.example` for the annotated list. Summary:

| Variable | Purpose |
|---|---|
| `APPWRITE_ENDPOINT` / `APPWRITE_PROJECT_ID` / `APPWRITE_API_KEY` | Appwrite connection (server-only) |
| `SESSION_SECRET` | HMAC session signing secret, 32+ random chars (required) |
| `OWNER_CODE` / `COUSIN_CODE` | Optional emergency staff access codes |
| `DEEPSEEK_API_KEY` / `AI_BASE_URL` / `AI_MODEL` | AI tools (OpenAI-compatible) |
| `DIFY_API_KEY` / `DIFY_API_URL` | SAME concierge chatflow |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` / `NOTIFY_EMAIL` | Email notifications |

Never commit real values; `.env*` is git-ignored.

## Routes

| Route | Access | Description |
|---|---|---|
| `/` | Public | Auction room catalogue (currently demo lots; real backend lands in the auction phase) |
| `/app` | Public | Product shell: Boutique / SAME chat / Media panels |
| `/app/settings`, `/app/billing` | Public | Shell settings and billing placeholders |
| `/request`, `/success` | Public | Sourcing request form + confirmation |
| `/login` | Public | Staff login |
| `/dashboard` | Staff | Requests, Stones, Add Stone, Paste-in, Traders, Jewelry onboarding |
| `/intelligence`, `/reports` | Staff | Market intelligence and sales reports |
| `/partner`, `/model/[code]`, `/trader/[code]` | Mixed | Partner/model/trader portal surfaces |
| `/terms`, `/privacy`, `/compliance`, `/legal` | Public | Legal and Kimberley Process disclosures |

## Scripts

```bash
npm run dev / build / start / lint
npm run sync:ames-content      # sync engine chat/boutique/media packs into public/
npm run test:ames-chat         # chat contract, viewer actions, turntable
npm run test:ames-boutique     # boutique pack contracts
npm run test:ames-media        # media pack contracts
npm run test:jewelry-onboarding
```

## Deployment

Vercel. `vercel.json` registers two crons (monthly ground report, quarterly
compliance briefing). Set every variable from `.env.example` in the Vercel project
settings. See `docs/STATUS.md` for the honest current-state assessment before any
production launch.
