# AMES operational admin dashboard

## Architecture discovered

`/admin` already used server-side Appwrite customer identity and the exact `amesadmin` label. Existing customer admin APIs reviewed jeweller applications and inventory, updated sourcing requests, and returned events. `VideoSection` and the separate existing video service already handled private uploads/publication. Jeweller quotes live on sourcing match records. Inventory and upload metadata use the existing JSON payload schema. This implementation extends those paths.

## Sections

- Overview: stored verified/application, pending/approved inventory, sourcing, draft quote, video and reserve/handoff counts.
- Jeweller applications: business/contact/location/capability details, notes, verification actions and reviewer/date.
- Inventory review: PENDING_REVIEW by default, all status filters, product/trust/commercial details, image/video/web3d/CAD review and explicit feedback.
- Videos: existing VideoSection, with upload, preview, draft/edit/publish/archive, safe deletion, ordering and approved product linkage unchanged. Publication/deletion actions now also write audit events.
- Users / Roles: safe read-only Appwrite identity/created date/account status/exact admin-label projection, profile state, and jeweller linkage. No impersonation, role mutation, passwords or session material.
- Sourcing: request context and status, matched jeweller identities, response/quote details, existing request status intervention and recent reserve/enquiry/handoff events. Private request notes/contact fields are omitted from the dashboard projection.
- Analytics: current stored totals, recorded product-view events, favorites, enquiries, requests, matches, quotes, publication and per-jeweller inventory/match counts. No unique visitor, active customer or conversion claims.
- System / Audit: latest 200 safe event summaries, 50 upload records and video publication metadata. Older actions before audit recording are not reconstructed.

## Collections and storage

Reuses `jeweller_sources`, `catalog_assets`, `sourcing_matches`, `analytics_events`, `favorites`, `user_profiles`, and existing `videos`. CAD/media binaries remain in private `media`. No new collection, environment variable, schema attribute or index. Existing collection configuration overrides still apply.

Appwrite Users is an optional server-only directory read, not a new collection. If inaccessible, stored profile visibility remains and labels/identity dates are explicitly unavailable. The directory projection has no secret fields. Existing pagination loads up to 5,000 records per source and fails closed beyond that rather than inventing partial totals. This is a V1 operational snapshot, not a high-volume analytics pipeline.

## Verification and inventory

Application transitions: APPLIED to UNDER_REVIEW/VERIFIED/REJECTED; UNDER_REVIEW to VERIFIED/REJECTED; VERIFIED to SUSPENDED; REJECTED reopens to UNDER_REVIEW; SUSPENDED may return to VERIFIED or UNDER_REVIEW through the API. Same-status saves preserve notes. Reviewer/date and the latest 100 review entries are kept on the application; separate JEWELLER_REVIEW events record status changes.

Inventory uses the existing record ID and approval endpoint. Dashboard actions approve/request changes/reject PENDING_REVIEW items or suspend APPROVED items. Existing admin API status capabilities remain for compatibility. Approval requires a VERIFIED jeweller and a controlled category. Rejection and requested changes require non-empty jeweller feedback. ReviewedBy, reviewedAt, latest 100 review entries and INVENTORY_REVIEW events record the decision; the jeweller receives feedback and review date.

Public placement continues using status=published plus inventoryStatus=APPROVED and the existing category mapping: Rings/ring, Watches/watch, Bracelets/bracelet, Necklaces/necklace, Earrings/earring. Leaving APPROVED removes purchasable visibility. Product ID and jewellerId remain intact for SAME, Favorites, Video, Reserve and handoff. No product duplication or fake fallback inventory.

Review events use existing analytics storage, not a separate audit platform. The gateway does not offer transactions: primary review records retain actor/date/history even if a later event append fails. A failed response requires refreshing to inspect current state; this is not a tamper-proof audit ledger.

## CAD/media

The preceding uncommitted CAD extension is included in this commit as a dependency. Main/gallery/detail images, optional video, self-contained GLB/GLTF and private CAD retain distinct roles and trusted metadata. Admin uses existing on-demand web 3D viewer. CAD is attachment-only, never rendered or made public by product approval. See [media setup and format restrictions](jeweller-media.md). Existing 4 MiB cap remains.

## Security

The page and each admin API resolve the authenticated Appwrite account on the server and require `labels?.includes('amesadmin') === true`. No email-based admin authorization. Origin checks continue for writes. Admin status alone cannot enter the jeweller portal; the separate VERIFIED application check remains. CAD reads require exact admin identity or VERIFIED owning jeweller, even after product publication. No server credentials or private direct Storage URLs are sent publicly.

## Manual Appwrite setup

No migration or new schema/index setup. For optional Users / Roles directory visibility, the existing server key needs `users.read`; do not grant user-write permissions. Without that read scope, the dashboard shows profile-only visibility. Admin label changes remain an Appwrite console operation. Preserve existing private collection/file/bucket permissions. Media extension allowlist requirements are in jeweller-media.md. No live Appwrite writes/settings changes were made during validation.

## Validation

- Production build passed.
- Full suite: 86/86 passed, including exact-label/dual-role access, verification transitions, feedback, category publication/revocation, audit metadata, role projections and CAD privacy.
- Production browser + isolated SDK fixture: all eight mobile sections, desktop, image/video/web3d preview, CAD denial/download, feedback/resubmission and category approval passed; no browser errors.
- Existing admin-video and jeweller-dashboard browser/SDK regressions passed, including public playback, category isolation, empty-category behavior, publishing lifecycle, portal ownership, media uploads and quotes.
- git diff --check passed.
- Synthetic validation records exist only in isolated local fixtures, never live inventory.

## Exact files in this commit

Dashboard and integration:
- src/app/admin/AdminConsole.tsx
- src/app/admin/page.tsx
- src/app/admin/admin.module.css
- src/app/admin/InventoryWebPreview.tsx
- src/lib/customer/admin-dashboard.mjs
- src/lib/customer/appwrite.mjs
- src/lib/customer/service.mjs
- src/lib/customer/jeweller-service.mjs
- src/lib/video-service.mjs
- src/lib/videos.ts
- src/app/jewellers/portal/JewellerDashboard.tsx

Included preceding CAD extension:
- src/app/jewellers/portal/InventorySection.tsx
- src/lib/customer/inventory-upload.mjs
- tests/inventory-upload.test.mjs
- docs/jeweller-media.md

Validation and documentation:
- tests/admin-dashboard.test.mjs
- tests/customer.test.mjs
- scripts/verify-admin-dashboard.mjs
- scripts/verify-admin-video.mjs
- scripts/verify-jeweller-dashboard.mjs
- docs/admin-dashboard.md
