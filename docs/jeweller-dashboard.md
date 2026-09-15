# AMES jeweller dashboard

## Architecture discovered

The existing `/jewellers/portal` was a server-rendered application status page with placeholder workspace cards and a minimal inventory form. Application records in `jeweller_sources` already controlled verification. Inventory in `catalog_assets` already had admin approval and public category placement. `sourcing_matches` already stored jeweller-to-request assignments, while `analytics_events` held sourcing requests and product handoffs. These tables use the same gateway contract: `userId`, `assetId`, `kind`, JSON `payload`, and `updatedAt`.

The dashboard reuses that architecture and the existing Appwrite session verifier. The public app, authentication, video publisher, canonical stone renderer, and category UI were not redesigned.

## Dashboard sections

1. **Overview:** approved inventory, pending review, assigned sourcing leads, unanswered/draft responses on open requests, total enquiry events, reserve requests, and desk handoffs.
2. **Profile:** business/trading names, contact name, phone, contact email, city/country, website, WhatsApp, specialties, supplied categories, bespoke/provenance/certification capabilities, delivery regions, and languages. Original application email and verification remain immutable. Editable contact email is stored separately, and profile saves bind the authenticated Appwrite user ID.
3. **Inventory:** owner-scoped images, names, categories, SKU, price/currency, availability, status, update date, details, review messages, media, and allowed actions.
4. **Upload jewelry:** product/commercial/material/source fields, optional stone data, and private main/additional images, video, and GLB uploads. Main-image selection and removal are supported. Uploaded files are limited to the smaller of the bucket maximum and 4 MiB per file, matching the current server upload path.
5. **Sourcing leads:** only existing assignments to the current jeweller, with a whitelist of customer requirements. Includes view, decline, and response/quote preparation. Customer names, contacts, raw notes, account IDs, match scores, and admin diligence are excluded.
6. **Responses / quotes:** one current response per assigned match; draft, sent, or declined. Supports proposed piece, price/currency, availability, delivery estimate, notes, expiry, and an optional approved inventory item belonging to the same jeweller. The request/customer/jeweller linkage remains on the original match. Sending stores the response; no external notification or payment is initiated.
7. **Analytics:** recorded inventory-view events, current favorites, enquiry/reserve/handoff events, assigned leads, sent responses, and pieces marked sold. Counts are real stored values; missing data is never replaced by fabricated figures. Total enquiries sums enquiry, reserve, and handoff events, not unique customers. Sold is a jeweller-reported signal, not proof of payment; revenue and conversion-rate analytics are not implemented.

## Inventory state rules

| Current state | Jeweller actions |
| --- | --- |
| New | Save as `DRAFT` |
| `DRAFT` | Edit, submit to `PENDING_REVIEW`, archive |
| `PENDING_REVIEW` | View only |
| `APPROVED` | View, mark sold, archive, request update |
| `CHANGES_REQUESTED` | Edit/save draft, resubmit |
| `REJECTED` | View safe review message, copy to a new draft |
| `SUSPENDED` | View only with explanation |
| `SOLD` / `ARCHIVED` | View only |

Requesting an update moves the same approved product ID to `CHANGES_REQUESTED` and removes it from public inventory immediately. This is stated beside the action. Editing then requires resubmission and admin approval. No parallel public copy is created. Copies of rejected items are private new drafts. Revision checks reject stale dashboard writes with HTTP 409; the existing gateway does not provide transactional compare-and-swap across competing requests.

The public rule stays: `status === published` AND `inventoryStatus === APPROVED`. Controlled categories are Rings, Watches, Bracelets, Necklaces, Earrings; the catalog adapter keeps the existing singular engine keys. Favorites, Reserve, SAME, and handoffs continue using the same approved inventory ID. Admin authorization is unchanged. A separate optional `reviewFeedback` field lets admin share a reason without revealing internal notes.

## Appwrite collections and payload additions

- **`jeweller_sources`**: existing `JEWELLER_APPLICATION`; adds optional contact/trading/WhatsApp/profile capability fields. Original email and verification/trust fields are preserved.
- **`catalog_assets`**: existing `JEWELLER_INVENTORY`; adds media references and certification notes. New private `JEWELLER_MEDIA` records track uploaded file ID, bucket, media kind, authenticated creator, and jeweller ownership in the same JSON payload structure. These records are excluded from public catalog inventory.
- **`sourcing_matches`**: existing `SOURCING_MATCH`; adds an optional `response` object with draft/sent/declined status, proposal fields, inventory linkage, and timestamps.
- **`analytics_events`**: existing sourcing request and product event records are read for scoped lead requirements and metrics. Optional bespoke requirements are retained when supplied.
- **`favorites`**: read only for aggregate counts on owned inventory.
- **`user_profiles`**: existing account-disabled check remains in force.
- **`media` bucket**: private uploaded image/video/GLB bytes, never database payloads.

No collection, column, index, environment variable, project, or database migration is required. Existing JSON payload capacity supports these fields. Payload filtering follows the existing paginated server gateway. Collections exceeding its 5,000-row safety ceiling fail closed instead of yielding incomplete analytics.

## Console setup

No mandatory new schema setup. Confirm that the existing media bucket is enabled, has file security enabled and empty bucket permissions, and permits `png`, `jpg`, `jpeg`, `webp`, `mp4`, `webm`, `mov`, and `glb` if an extension allowlist is active. Retain existing allowed formats. Do not make the bucket or uploaded files public. Existing server key storage file read/write and table row read/write scopes must remain available.

No live console changes were applied. The previous admin-video `videos.metadata` setup remains a separate requirement for video publishing; this dashboard adds nothing to `videos`.

## Security boundaries

Every dashboard request obtains identity from the authenticated Appwrite session, checks the existing disabled-account policy, resolves exactly one linked application, and requires `VERIFIED`. Linkage uses the stored authenticated user ID when present, otherwise the original application email. Admin label alone does not grant portal access. Non-verified `jewellers/me` reads now also fail closed; the pre-existing public application-submission endpoint remains available for onboarding.

Profile writes use an explicit whitelist and preserve admin decisions, trust fields, original linkage, and private notes. Item and lead IDs are lookup selectors only: server-stored ownership is checked before any read or change. Clients cannot assign jeweller/customer IDs, set approval status, or attach another jeweller's uploads/inventory. Sourcing responses preserve original assignment and customer IDs on the server while excluding those IDs from the portal projection. Same-origin writes are required.

Owner media previews require verified ownership. Public inventory-media delivery requires a linked approved inventory record; otherwise it permits only the verified owning jeweller or an authenticated `amesadmin` reviewer. This reviewer exception is on the existing customer media integration path, not on portal APIs. Each stream rechecks access, uses private no-store responses, and supports byte ranges. Uploaded media signatures, MIME types, size, private bucket settings, and file-reference ownership are checked. Unused uploads are retained privately; this version has no destructive storage cleanup action.

## Validation

- Production Next build and TypeScript: passed.
- Full Node suite: 79/79 passed, including verified-only access, account linkage, ownership isolation, private review feedback, draft/edit/submit transitions, self-approval rejection, read-safe approved records, category storage, private/public media transitions, matched-lead scoping, quote linkage, and scoped analytics.
- `node scripts/verify-jeweller-dashboard.mjs`: production server and actual Appwrite SDK against an isolated local HTTP fixture. Exercises image/video/GLB upload, mobile draft editing/submission, approval-gated media, other-jeweller denial, matched-lead response, contact email without account relinking, guest/admin-only denial, and mobile/desktop layout. No browser errors or horizontal page overflow.
- Local screenshots/checks: `outputs/jeweller-dashboard/` (not committed). Test records and a neutral upload-test bitmap exist only inside the local fixture, never live Appwrite.
- `git diff --check`: passed.

No push or deployment.

## Exact files changed

- `docs/admin-video-publishing.md`
- `docs/jeweller-dashboard.md`
- `scripts/verify-jeweller-dashboard.mjs`
- `src/app/admin/AdminConsole.tsx`
- `src/app/jewellers/portal/InventorySection.tsx`
- `src/app/jewellers/portal/JewellerDashboard.tsx`
- `src/app/jewellers/portal/page.tsx`
- `src/app/jewellers/portal/portal.module.css`
- `src/lib/customer/appwrite.mjs`
- `src/lib/customer/jeweller-service.mjs`
- `src/lib/customer/service.mjs`
- `tests/appwrite-fixture.mjs`
- `tests/customer.test.mjs`
- `tests/jeweller-dashboard.test.mjs`
- `tests/jeweller-fixture.mjs`
