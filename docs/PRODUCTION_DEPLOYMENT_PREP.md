# Production credentials and deployment prep — 2026-09-08

This supplements APPWRITE_MVP_DEPLOYMENT.md. No deployment, domain configuration, new infrastructure or credentials were created. Existing Appwrite resources were reused. Preparation is complete; production release remains gated below.

## Runtime configuration and secret boundary

| Variable | Exact runtime consumers and purpose | Delivery boundary |
| --- | --- | --- |
| AMES_APP_ORIGIN | customer/config.mjs validates the explicit origin; customer/service.mjs uses it for mutation Origin checks and signed delivery URLs; legacy-auth.mjs uses it for request checks and HTTPS cookie selection; api/auth/login/route.ts checks the configured external origin behind a proxy. | Server configuration, not a credential. Never NEXT_PUBLIC or next.config.env. |
| ASSET_DELIVERY_SECRET | customer/config.mjs requires at least 48 characters; customer/service.mjs authenticates short-lived asset leases bound to user, session, asset, revision and expiry. | Server-only signing material; independent cryptographically random owner-supplied value. No value is returned in a lease. |
| SESSION_SECRET | middleware.ts, session-policy.ts, legacy-auth.mjs and api/auth/login/route.ts authenticate existing staff/portal cookies; health readiness checks configuration. This does not replace Appwrite customer identity. | Server-only independent signing material, minimum 32 characters; insecure default rejected. |

Paths above are under src/lib or src/app unless stated otherwise. Comments and the blank .env.example document these purposes. Runtime configuration is never placed in next.config.env (which would inline it), and production code does not import test fixtures. Endpoint/project/key are read by the server SDK; browser requests use the same-origin Next API. The existing real endpoint/project passed live SDK tests without printing their values.

Owner must supply all three missing variables through Vercel server environment settings. Generate the two independent secrets with a cryptographic password manager or OS cryptographic generator outside the repository; length alone is not entropy. No substitute production values were generated. Use a separately scoped runtime Appwrite key as described in APPWRITE_MVP_DEPLOYMENT.md; do not deploy the broad provisioning/QA key or users.write scope. Keep provisioning/import keys local to the operator.

### Scan evidence and release gate

`outputs/deployment-secret-audit.json`: 145 tracked working files, 145 index blobs, 400 locally reachable historical blobs and 68 browser/public artifacts inspected. No configured secret value matches, populated tracked environment files, or browser references to the three variables were found. The actual local Appwrite key is absent from those artifacts. All three production values are currently unset, so their as-yet-unsupplied values cannot be certified by this scan. Remote-only or unreachable deleted Git objects are outside this audit.

The audit found the old insecure SESSION_SECRET fallback in three historical blobs and three unchanged index entries. Values are deliberately not reproduced. The hardened working tree rejects the default; history is **not clean of historical default secrets**. Do not reuse an old default. No history rewrite was performed. Current backend hardening and release assets include pre-existing uncommitted/untracked work: the current Git index/HEAD is not the tested release. Review and commit the intended hardened release (including required engine archive, scripts and canonical asset staging) before a Git-based deployment; exclude .env.local, generated test output and temporary test credentials. Do not deploy an older server-key-enabled build against the now-private tables.

`outputs/env-boundary.json`: 25 first-party client roots / 31 reachable modules contain no server imports/variables; all three example values are blank. This static import check is complemented by the built-artifact byte scan, not a claim of formal information-flow verification. Runtime readiness correctly remains false with the three missing variables.

## Vercel origin and HTTPS

Use the real, assigned stable Vercel project/branch alias initially; obtain it from the owner console rather than inventing a hostname. Set AMES_APP_ORIGIN to its exact HTTPS origin, without path/query/trailing slash. Unique per-deployment URLs change; keep the configured stable alias as the canonical application entry point. Preview environments require their own exact origin and isolated backend data; do not indiscriminately attach production credentials to every preview.

Later, once the owner configures a custom domain, change AMES_APP_ORIGIN and redeploy. No Engine, storage or authentication architecture change is needed. Only one configured origin is accepted; the old origin is rejected. Do not infer production trust from incoming Host/Origin headers or introduce wildcard origins. Host-only cookies require login on the new hostname; existing leases are short-lived. No parent-domain cookie for vercel.app.

Customer HTTPS cookies are __Host-ames_customer, Secure, HttpOnly, SameSite=Lax, Path=/ with no Domain attribute; their lifetime is bounded by Appwrite expiry and 24 hours. Staff cookies are Secure in production and expire at eight hours. Portal cookies now follow configured external HTTPS even when internal forwarding uses HTTP. The staff login Origin check also uses the explicit external origin. Unit, HTTP and production-browser fixture checks cover these boundaries. Loopback HTTP testing does not certify deployed TLS.

Existing vercel.json selects Next.js, npm ci --include=dev and npm run build, with no-store API and no-referrer/nosniff headers. API handlers use the existing Node server runtime. No wildcard CORS was introduced. Register the actual owner-approved hostname in Appwrite's Web platform settings. The browser talks to Next, and Next talks to the existing Appwrite endpoint; do not add public administrative credentials.

## Startup investigation

**EXPECTED:** CENTER Chat opens responsively; an unvisited offscreen Boutique should not initialize an extra WebGL viewer during intro/startup.

**ACTUAL:** the earlier real-app-report.json cold 390px sample recorded a 2,295 ms main-thread task alongside a 2,295.3 ms Boutique mount. Both host surfaces mounted immediately, although Chat is the initial screen.

**FIRST BLOCKING TASK:** initial WebGL2 context creation inside the existing WebGLRenderer constructor invoked by Boutique.mount. Instrumented HTMLCanvasElement.getContext calls consumed 1.33–1.68 seconds before the Chat context in the isolated cold before samples. Existing viewer setup then builds the studio environment. The measurements identify synchronous graphics initialization; they do not attribute every remaining millisecond to a particular shader or establish network loading as the cause.

**EVIDENCE:** outputs/startup-before.json and startup-after.json use the production build, seeded HTTP fixture, 390px desktop Chrome SwiftShader, two fresh browser runs each and disabled shader disk cache. Before: one opening Boutique canvas, longest tasks 8,533 / 7,492 ms. After: zero opening Boutique canvases, longest tasks 4,447 / 4,966 ms; first Boutique visit mounted one canvas in 699 / 403 ms without adapter error. These deliberately cold software-rendered timings are not physical Android/iPhone measurements and are not directly comparable to the earlier 2.3-second sample.

**MINIMUM FIX:** AmesEngineSurfaces.tsx defers Boutique mounting until the first active visit; app/page.tsx passes the existing active-panel state. Once visited it stays mounted, preserving material/favorite/viewer state on later navigation. No splash, Engine, renderer or app-shell rewrite. Chat still creates its necessary context at startup. The remaining 4–5 second cold task is unresolved; profile a physical device with hardware acceleration before accepting startup responsiveness. No further speculative optimization was attempted.

## Legacy stock/document workflow classification

Scope assumption: this MVP offers interactive catalog discovery, accounts and saved items; it does not certify dealer inventory operations or live checkout. Existing Chat prompts still mention desk-assisted reserves, so desk fulfilment must not be advertised as automated/verified stock processing.

| Workflow and current code | Classification | Evidence / disposition |
| --- | --- | --- |
| Customer catalog_assets, media GLB delivery, accounts, favorites, saved stones/jewelry (customer/service.mjs and adapters) | REQUIRED_FOR_MVP | Working production backend paths; retain all entitlement/ownership checks. Approved real jewelry catalog content is still an owner launch gate. |
| Legacy stone entry/import, consignment, trader stock operations (api/stones, api/ai/parse-stock, db.ts) | SAFE_TO_DEFER | Existing stones table has only ref/stone_type/shape and zero inventory. Full CRUD expects additional fields. Do not add schema or claim stock-entry acceptance in this milestone. |
| Live reservations, sales/commission, balances and dealer/model portals (api/orders, trader/model routes, db.ts) | SAFE_TO_DEFER | Staff/owner guards remain required now; full inventory/financial lifecycle is not proven. Desk contact is not an automated checkout guarantee. Retain access restrictions; no new feature work. |
| Weekly trader reports and private PDF delivery (api/reports, db.ts report helpers, reports bucket) | SAFE_TO_DEFER | Historical reports bucket is absent. Private document storage/delivery requires a reviewed contract before activation; do not make PDFs public to get a route working. |
| Licence document onboarding and retrieval (db.ts, licence-docs bucket) | SAFE_TO_DEFER | Historical licence-docs bucket is absent. No new bucket or onboarding workflow built. |
| Unused saveLicenceDoc/getLicenceDocUrl/getLicenceUrl raw storage URL helpers and private-report raw URL pattern | REMOVE/DEPRECATE | Do not reuse discoverable raw URLs for confidential documents. Classification only; no blind removal of legacy resources or construction of a replacement feature. |

## Deployment and rollback checklist

1. Review the hardened release and its existing uncommitted changes; capture a release commit and tested engine archive hash. Never publish the currently stale index/HEAD as-is.
2. Owner supplies actual origin and two independent signing secrets, plus a least-privilege runtime Appwrite key. Copy database/table/bucket IDs from .env.example and verify them against the existing project; do not recreate resources. Configure correct Vercel environment scope and Appwrite hostname. No secret gets NEXT_PUBLIC_ or next.config.env exposure.
3. Build with the existing Vercel configuration. Use one private media bucket with per-file ACLs and four logical storage classes, preserving the provider abstraction. The bucket's current 10 MiB maximum still applies. Import approved GLBs using the operator workflow, not a public browser URL or oversized Vercel form upload.
4. On an owner-authorized deployment, check /api/health liveness and its readiness mode, then actual HTTPS signup/login/reload/logout, favorites and both save types, authorized lease streaming, discovered storage URL denial, cross-user denial and entitlement revocation. Local production-mode results do not replace this deployed check.
5. Confirm error logging does not collect environment values, cookies, auth bodies or signed query strings. Existing redacted API failures and ames:diagnostic hooks remain available. Run physical-device startup and approved-content acceptance before public launch.
6. Roll back only to a previously hardened release compatible with the private tables and ownership fields. Preserve Appwrite ACLs and additive schema; never restore guest CRUD or default credentials. Keep the configured origin aligned with the rollback alias. Rotate signing material if exposure is suspected, accepting session/lease invalidation; never log it.

## Verification

Next production build passed. Full app suite: 23 tests passed; full existing Engine suite: 132 tests / 32 files passed. Real Appwrite production-Next run qa-2448a61b: 474 checks passed, including process-restart persistence, isolation, actual private GLB delivery (30,964 bytes, canonical hash verified), revocation and cleanup. Browser tests use a separate explicitly synthetic Appwrite HTTP fixture over loopback HTTPS; they are not a deployed-cloud browser claim. Detailed reports are in outputs and the shared customer-backend-proof.json. No paid services, domain, deployment or protected geometry changes.

Primary configuration references: [Next environment variables](https://nextjs.org/docs/pages/guides/environment-variables), [next.config.env inlining](https://nextjs.org/docs/pages/api-reference/config/next-config-js/env), [Vercel generated URLs](https://vercel.com/docs/deployments/generated-urls), [Vercel environment scopes](https://vercel.com/docs/deployments/environments), [Appwrite SSR authentication](https://appwrite.io/docs/products/auth/server-side-rendering).
