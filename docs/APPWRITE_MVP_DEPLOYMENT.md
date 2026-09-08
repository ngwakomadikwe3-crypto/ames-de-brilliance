# AMES customer backend deployment

Latest credential/origin audit, startup evidence, legacy workflow classifications and release gates: [PRODUCTION_DEPLOYMENT_PREP.md](PRODUCTION_DEPLOYMENT_PREP.md). The hardened working tree is tested; the stale Git index/HEAD is not the release.

## Current storage/security migration (supersedes historical snapshots below)

2026-09-08: the six explicitly inventoried QA accounts were deleted and verified absent using users.write. The reviewed migration in `FINAL_SECURITY_MIGRATION_PLAN.md` has made all 17 legacy tables private with row security enabled; existing row data was preserved. The nine customer tables were reused. A nullable chats.userId column and its index scope new chat history to verified customers; old unowned conversations remain staff-only. Next route authorization must be deployed with this change: an older deployed server key can still bypass table ACLs.

Use **one bucket, `media`**, for all four logical storage classes. It was confirmed empty immediately before migration. Bucket permissions are now empty and file security is enabled; the 10 MiB maximum, encryption and antivirus were preserved. Allowed extensions are jpg/jpeg/png/webp/gif/glb/mp4/webm/mov. Protected GLBs have empty per-file ACLs; intentionally public previews/photos/video have read(any) only. Public media upload hooks validate content type and cannot publish a GLB disguised as an image/video. Never give the bucket public read permission: that would defeat private file permissions. No bucket was created/deleted and no plan upgraded. Reusing `media` resolves the additional-bucket quota blocker for the MVP.

The exact defaults and `.env.example` map APPWRITE_BUCKET_JEWELRY, APPWRITE_BUCKET_STONES, APPWRITE_BUCKET_PREVIEWS and APPWRITE_BUCKET_GENERATED to media. They remain separately overridable storage references behind the existing delivery adapter. The operator importer checks actual bucket privacy, extensions and maximum size before uploading. Its general 50 MiB parser ceiling does not override the live bucket's 10 MiB maximum. Public form uploads are also subject to Vercel's ingress limits.

Runtime credentials need files.write only if enabling the authenticated legacy public-media upload routes. Provisioning/users.write credentials remain operator-only; do not deploy the broad local QA key. SESSION_SECRET also signs entity-bound legacy trader/model portal sessions. The existing phone+code login now requires both and does not permit omitted-phone access; existing portals require re-login. Session validity rechecks that the entity is active. Longer-term portal migration to linked Appwrite identities remains preferable to legacy shared identifiers.

Owner still supplies the real AMES_APP_ORIGIN, ASSET_DELIVERY_SECRET and SESSION_SECRET, and deploys the hardened Vercel build. Do not invent these values. The existing legacy stones table has only ref/stone_type/shape columns and no inventory; its old stock-entry schema is incomplete. Reading empty public inventory uses the built-in creation timestamp. Do not claim stock-entry/reservation acceptance or create missing stock columns automatically. Historical licence-docs/reports storage routes remain unsupported until moved to a reviewed private document-delivery contract; no confidential documents were made public.

Evidence: outputs/final-qa-cleanup.json, outputs/final-security-audit.json (before-state), outputs/final-security-migration.json and outputs/live-appwrite-e2e.json. The live runner's --next mode uses the actual production build against real Appwrite, ephemeral local signing material and temporary schema-valid rows/files/users; it does not deploy Vercel. The separate browser suite explicitly uses an Appwrite HTTP fixture and must not be presented as live cloud/browser proof.

## Implemented boundaries

`src/lib/customer/service.mjs` owns identity, ownership, access policy, writes and leases. `appwrite.mjs` is the server-only database/storage adapter. `/api/customer/[...path]` runs in the Next Node runtime on Vercel. The browser imports only `CustomerState.tsx`; no administrative SDK or secret is bundled. Each authenticated request uses a fresh Appwrite session client and `Account.get`. Customer registration/login use Appwrite Account, logout deletes the remote session, and reload restores from an HttpOnly, SameSite=Lax cookie. HTTPS uses the Secure `__Host-ames_customer` cookie. Session lifetime is bounded to the earlier of Appwrite expiry and 24 hours. Local HTTP is allowed only for loopback development, with the same remote identity checks and a non-Secure loopback cookie. There is no production mock or bypass.

This follows [Appwrite SSR authentication](https://appwrite.io/docs/products/auth/server-side-rendering). The fixture in `tests/appwrite-fixture.mjs` is test-only and is never imported by production code.

## Exact configuration

Use the checked-in `.env.example`. Do not put keys, sessions or delivery secrets in `NEXT_PUBLIC_*` variables. Do not commit a populated environment file.

| Variable | Owner supplies / default |
| --- | --- |
| `APPWRITE_ENDPOINT` | Exact regional/self-hosted HTTPS endpoint ending `/v1` |
| `APPWRITE_PROJECT_ID` | Real project ID |
| `APPWRITE_API_KEY` | Server runtime key: sessions.write, rows.read, rows.write, files.read, tables.read, buckets.read |
| `AMES_APP_ORIGIN` | Exact Vercel HTTPS origin, no trailing slash/path; preview deployments need their own matching origin and staging project |
| `ASSET_DELIVERY_SECRET` | Independently generated random secret, at least 48 characters |
| `SESSION_SECRET` | Independently generated secret, at least 32 characters, for the existing staff subsystem; not customer identity |
| `APPWRITE_DATABASE_ID` | `ames` |
| `APPWRITE_COLLECTION_PROFILES` | `user_profiles` |
| `APPWRITE_COLLECTION_FAVORITES` | `favorites` |
| `APPWRITE_COLLECTION_SAVED` | `saved_assets` |
| `APPWRITE_COLLECTION_DESIGNS` | `generated_designs` |
| `APPWRITE_COLLECTION_ENTITLEMENTS` | `entitlements` |
| `APPWRITE_COLLECTION_SUBSCRIPTIONS` | `subscriptions` |
| `APPWRITE_COLLECTION_CATALOG` | `catalog_assets` |
| `APPWRITE_COLLECTION_EVENTS` | `analytics_events` |
| `APPWRITE_COLLECTION_LIMITS` | `auth_rate_limits` |
| `APPWRITE_BUCKET_JEWELRY` | `media` |
| `APPWRITE_BUCKET_STONES` | `media` |
| `APPWRITE_BUCKET_PREVIEWS` | `media` |
| `APPWRITE_BUCKET_GENERATED` | `media` |
| `APPWRITE_PROVISION_KEY` | Local operator only: databases/tables/columns/indexes/buckets read and write. Do not deploy this key to Vercel. |
| `APPWRITE_ASSET_IMPORT_KEY` | Local operator only: rows read/write and files read/write. Do not deploy this key to Vercel. |

Enable Appwrite email/password authentication and register the actual Vercel hostname as a Web platform. Browser calls are same-origin to Next; no wildcard API CORS is required or enabled. Every cookie-authenticated mutation requires the exact configured Origin. Production proxies must overwrite, not trust arbitrary incoming, `X-Forwarded-For`; Vercel supplies this ingress boundary. Auth attempts reserve atomic Appwrite document slots (10 per email and ingress IP per 10 minutes), including failed attempts. Run the expiry cleanup below daily.

## Collections and ownership

`node scripts/provision-customer.mjs` prints a dry-run plan. With operator credentials, `node scripts/provision-customer.mjs --apply` creates missing resources, waits for attributes/indexes, and rejects unsafe existing collection/bucket permissions or incompatible string attributes. Back up existing resources before applying; it does not repair or delete existing data. Provisioning during production requests is disabled.

All nine collections have empty collection permissions, document security enabled, and empty document permissions. Users access records through the authenticated server only; an Appwrite client session alone cannot list or change them. Shared row schema: required `userId` (128), `assetId` (128), `kind` (64), bounded JSON `payload` (60000), and datetime `updatedAt`. Indexes cover userId, assetId, kind and updatedAt. Deterministic 36-character SHA-256-derived document IDs enforce per-user favorite/saved/profile identity; every lookup/write derives the owner from verified Account identity. User-submitted owner/admin fields cannot grant authority.

Profiles contain account state and allowlisted preferences. Favorites and saved records distinguish stone/jewelry. Generated designs store a bounded structured spec with server-selected draft status; this does not modify the generator or claim generation completion. Entitlements and provider-neutral subscription records are server/admin controlled. Catalog payloads reuse the existing AssetRecord schema plus revision, SHA-256, byte length and private storage reference. Analytics supports JEWELRY_VIEWED, STONE_VIEWED, SAVED, FAVORITED, COMPARED, PREMIUM_PREVIEWED, ACCESS_GRANTED, ACCESS_DENIED and SUBSCRIPTION_STARTED. Clients cannot forge the last three security/subscription events. Audit records contain no session secrets or signed URLs.

PUBLIC permits published public metadata/bytes. MEMBER requires an enabled account. PREMIUM and COLLECTOR require an exact active tier subscription/grant or explicit asset grant. PRIVATE requires ownership or an explicit asset grant. An Appwrite user label `amesadmin`, set only by the owner in the Appwrite console/server, enables admin operations. Explicit deny wins, including over admin; expired grants/subscriptions, disabled accounts and unpublished assets fail closed. AI recommendations have no authorization role. Existing public canonical IDs cannot be relabeled protected.

## Working API

All paths below are under `/api/customer`. JSON mutations require Content-Type application/json and matching Origin; authenticated requests also carry the HttpOnly session cookie.

| Method/path | Body / result |
| --- | --- |
| POST register | email, password, optional name; creates Appwrite account/session/profile |
| POST login; POST logout | email/password; empty object for logout |
| GET session | verified user or null |
| GET catalog | safe AssetManifest; inaccessible PRIVATE records omitted; storage references stripped |
| GET state | current user's profile, favorites, saved, designs, entitlements, subscriptions |
| PUT/DELETE favorites; PUT/DELETE saved | assetId; server checks access and derives owner/kind |
| PUT preferences | allowlisted appearance/glow/sound/haptics values |
| PUT/DELETE designs | designId and spec for PUT; owner-scoped records |
| GET access/:assetId | backend entitlement decision and audit |
| POST delivery/:assetId | empty object; authorized 60-second URL and expiresAt |
| GET assets/:assetId.glb | authorized streamed GLB; protected requests require valid lease and current session |
| POST events | approved client event type, optional assetId |
| PUT admin/entitlements | userId, tier, effect allow/deny, future expiresAt, optional assetId |
| PUT admin/subscriptions | userId, tier, status active/canceled/past_due, future expiresAt |
| PUT admin/catalog | asset: validated metadata + revision + private storage reference |

No payment provider is hard-coded. A future verified payment adapter must translate provider events into this server-controlled subscription interface; browser events never activate subscriptions.

## Private storage and registration

Four logical asset classes share the media bucket, with catalog metadata recording category and type. GLB permissions are empty; intentionally public previews have explicit read(any). Imports use the existing Engine GLB-container validator and are bounded by the live bucket maximum. Catalog previewPath stays null until a preview has been explicitly approved for public delivery.

`node scripts/register-customer-canonical.mjs` validates the five existing public canonical files without changing geometry. Add `--apply` with the import key to upload/register those exact bytes. For each approved jewelry export, use `node scripts/register-customer-asset.mjs metadata.json export.glb` and then `--apply`. Metadata must use the existing AMES AssetRecord fields, uppercase accessTier, status published, previewPath null and revision 1 (or an increased revision for updates). Tags containing generated select the generated bucket. No test jewelry is silently published. Repeated existing revisions stop rather than overwrite. Orphan uploads after a failed registration remain private; inspect before cleanup.

Flow: verified request -> server entitlement check -> HMAC lease bound to asset/revision/user/session/expiry -> same-origin HTTPS GLB endpoint -> entitlement recheck -> private Appwrite byte stream -> existing AMES Engine loader. The endpoint verifies bucket/file privacy on each download. It sends no redirect, Appwrite key, storage token or raw bucket URL. URL discovery/replay without the matching valid session fails; revocation applies on the next request. Bytes already downloaded cannot be recalled. Responses are private/no-store. Storage fetch has a 30-second timeout. No GLB upload passes through Vercel's request body limit: the operator CLI uploads directly to Appwrite. The provider is contained in the gateway and server storage reference; a later object-store migration does not change the renderer.

## Operations and validation

Vercel uses the existing vercel.json and Next Node API functions. `/api/health` is liveness; `/api/health?mode=ready` fails closed unless configuration, canonical files, staff secret, and reachable private Appwrite collections/buckets pass. Dependency readiness is not whole-product certification. JSON service errors are redacted; host `ames:diagnostic` hooks remain available. Do not log request cookies, bodies or delivery query strings in an external logger.

Daily operator task: `node scripts/cleanup-customer-limits.mjs` for a dry run, then `--apply`. It deletes only auth-slot documents older than 24 hours. Set a retention policy for analytics with the owner before launch. Server reads are paginated in batches of 100 and explicitly fail above 5000 rows instead of returning silently incomplete state; larger catalogs require the existing scaling milestone's pagination work before promotion.

Local checks: `npm test`, `npm run build`, `npm run validate:session`, `npm run validate:deployment`. Set AMES_ENGINE_WORKSPACE to the existing engine checkout and run `node scripts/validate-customer-e2e.mjs`. That script uses desktop Chrome, the production Next build, a temporary loopback HTTPS proxy and a clearly labelled Appwrite HTTP fixture through the actual SDK. It proves account reload, favorite reload, saved-stone restoration, denied delivery, admin grant, authorized Engine loading and anonymous replay rejection. It is not a live Appwrite or physical-device test.

## Owner release gate and rollback

The reviewed migration secured the 17 legacy tables and the media bucket. The final built-Next/live-Appwrite run passed **474 checks**, including valid unauthorized CRUD probes for anonymous/A/B across all 26 tables, real customer and admin identity, admin revocation, persistent favorites/saved stone/saved jewelry across Next restarts, owned chats/messages, staff access, private GLB bytes, discovered-URL denial, lease replay/revocation and public preview reads. The 30,964-byte GLB matched its unchanged canonical source SHA-256. This proves delivery, not photorealism or newly generated jewelry. Every run-created account, catalog/state/ACL probe and uploaded file was cleaned up; authentication rate counters remain governed by normal retention.

Remaining configuration: `.env.local` supplies endpoint/project/API key but lacks AMES_APP_ORIGIN, ASSET_DELIVERY_SECRET and SESSION_SECRET. All needed scopes worked in the live operator run. Use separate least-privilege Vercel runtime credentials and deploy this build; the current tests use ephemeral loopback signing material, not invented production secrets. The earlier admin label ames-admin was rejected by the real API. The implementation and live proof now use **amesadmin**, matching [Appwrite's alphanumeric label requirement](https://appwrite.io/docs/references/cloud/server-swift/users). No real user was granted administrator privileges during QA.

1. Supply the real keys/secrets/origin through server environment settings, retaining the verified table IDs and media bucket aliases. Assign amesadmin only to an owner-approved real account.
2. Back up the existing Appwrite project and use staging for future migrations. The completed production ACL migration's before-state and verification reports are retained in outputs; do not rerun a historical unsafe permission setup.
3. Import approved assets, keep every protected GLB out of Next public and public buckets, assign the real administrator label, and set real user grants/subscriptions. No default staff credentials or development grants exist.
4. Run the two-user live acceptance: sign in, favorite jewelry, reload; save a stone, reload; verify the second account cannot read/edit the first account's records; exercise deny, grant, expiry, logout and private-file URL discovery. Verify health readiness and provider permission errors using the real service. Confirm Vercel response streaming and deployed Appwrite limits for the chosen asset sizes.
5. Resolve or explicitly disable the incomplete legacy stock-entry schema and old licence/report storage workflows before advertising them. Review unowned historical chat records as staff; never expose them globally. Existing product/renderer/physical-device gates from AMES_STATE.md remain. Browser checks passed desktop Chrome and a 390px viewport with the explicitly synthetic Appwrite fixture, including guest Chat, stone commands, Video feed/navigation and protected Engine loading; there is no real video inventory or physical-device certification in this run.
6. Promote the tested Vercel build only after these gates pass. No paid infrastructure/domain was purchased or deployed.

Rollback: retain the previous Vercel deployment and private Appwrite backup. Roll back the application without deleting collections or buckets; schema additions are forward compatible. Unpublish a bad catalog revision or apply an explicit deny. Rotate the delivery secret to invalidate all outstanding leases, revoke compromised Appwrite sessions/keys, and verify denied delivery before reopening. A rollback must never make protected files public.
