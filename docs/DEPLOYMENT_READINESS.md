# AMES launch deployment

Latest deployment target and contract: **Vercel + Appwrite**, documented in [APPWRITE_MVP_DEPLOYMENT.md](./APPWRITE_MVP_DEPLOYMENT.md). No alternate database or object-storage provider was introduced. Current real-app device evidence is in engine `outputs/device-readiness` (outside its checkout). Production remains blocked.

Status: **NO-GO for a secure MVP**. A successful build is not launch approval. The secure entitlement/delivery milestone was interrupted, the canonical photorealistic renderer remains unaccepted, and no production jewelry catalog or account persistence is wired to the engine surfaces.

## Build and release

Use Node 24 LTS, `npm ci`, `npm run build`, then `npm run start`. The engine is a checked-in local archive under `vendor/`, with lockfile integrity; deployment does not depend on a developer's absolute path. Its Three.js peer range supports the app's existing 0.183.2 and the engine's tested 0.185.1. Do not upgrade render dependencies during deployment.

The five public canonical GLBs are staged under `public/models/canonical`, with an integrity manifest. To refresh them, set `AMES_ENGINE_ROOT` to a verified engine checkout and run `npm run sync:engine-assets`. The script verifies upstream validation hashes before copying. It never copies protected originals. Deploy the entire `.next` release together with `public`, the package/lockfile and installed production dependencies. Do not publish the engine research `dist` directory as the production app.

## Environment

| Variable | Scope | Purpose |
| --- | --- | --- |
| `APPWRITE_ENDPOINT`, `APPWRITE_PROJECT_ID`, `APPWRITE_API_KEY` | Server | Existing data/storage backend. Credentials alone do not certify connectivity or entitlements. |
| `SESSION_SECRET` | Server secret | Unique high-entropy value, at least 32 characters; missing/default fails closed, eight-hour server expiry, Secure production cookies. Customer Appwrite authentication still pending. |
| `OWNER_CODE`, `COUSIN_CODE` | Development secret | Explicit local fallback only; disabled in production. No built-in default codes. |
| `APPWRITE_AUTO_PROVISION` | Development configuration | Explicit `true` permits local bootstrap. Ignored in production; existing remote permissions require a reviewed migration. |
| `DEEPSEEK_API_KEY`, `AI_BASE_URL`, `AI_MODEL` | Server | Existing optional AI service. AI is never entitlement authority. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `NOTIFY_EMAIL` | Server | Existing email integration, if enabled. |
| `NEXT_PUBLIC_DIFY_URL` | Public build value | Optional existing embedded Chat configuration; never put secrets here. |
| `AMES_ENGINE_ROOT` | Build tooling only | Source of verified public GLBs when refreshing staged assets. |

The current Next font build fetches Google Fonts. CI requires network access to fetch the existing fonts; no fallback font substitution was made. Pin Node/npm and retain the lockfile. No new paid service was added.

## Health and logging

`GET /api/health` is process liveness (200). `GET /api/health?mode=ready` returns 503 while required launch gates are missing; it reports configuration and public-file existence, not database connectivity. Secure entitlement implementation is explicitly false in this release. Do not use liveness as readiness or disable this blocker to obtain a green deploy.

The engine integration exposes `COMMAND_FAILED`; observer errors cannot break command/lifecycle behavior. App surfaces emit `ames:diagnostic` events with a safe code and surface name for a host logging adapter. Do not log signed URLs, API keys, session tokens, private asset paths or Chat bodies. Existing performance entries expose surface mount/load and splash readiness/transition. Client measurements are diagnostics, never authorization.

## Release checklist and rollback

1. Run engine build, full unit/integration suite and `scripts/validate-launch.mjs` against a production Vite preview. Run `scripts/validate-app-launch.mjs` against the Next production server. Preserve reports with the release identifier.
2. Verify all five public asset hashes and unchanged Benchmark 02; check the release contains no private GLBs or environment files.
3. Complete authenticated backend entitlement checks, signed delivery, secure staff sessions and persistence. Exercise real granted/denied users. Keep protected files outside all public directories and CDN public origins.
4. Seed approved jewelry/catalog metadata through batch ingestion, retaining previous immutable snapshots. Do not substitute test fixture metadata for approved production content.
5. Complete real iPhone Safari/Android device tests, real account/AI flows, Video content playback and favorites/save persistence. Chromium viewport/touch emulation is only a preliminary check.
6. Deploy to staging, check readiness and representative public/protected loads, then approve production promotion.

Retain the previous app artifact, engine archive, lockfile and catalog version. Roll back the app and catalog snapshot together; retain versioned public paths for old clients. Revoke signed leases and roll back backend policy independently when security requires it. This milestone performs no database migration and publishes nothing externally.
