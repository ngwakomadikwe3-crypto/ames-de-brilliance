# AMES admin rendering and owner metadata

## Confirmed cause

Read-only inspection of the configured live Appwrite project `6a8d93140026683be1e3`, database `ames`, found the newly created tables. Their **names** are `jeweller_sources` and `sourcing_matches`, but their **IDs** are generated values:

| Table name | Actual table ID |
| --- | --- |
| jeweller_sources | `6aa837ef0005388425f1` |
| sourcing_matches | `6aa83bd600074e95436c` |

AMES was using its default collection IDs, which are the names above. Reads returned HTTP 404 / `table_not_found`. `adminDashboard()` loaded all six datasets with a single `Promise.all`; either rejection prevented all dashboard data from rendering. `/admin` also coupled its initial authorization result to that aggregate data response. The Admin menu appearing is consistent with valid role detection while dashboard data fails.

This was reproduced against live data through the existing server gateway. It was not diagnosed by assuming a missing role, changing labels, authorizing by email, or inspecting private credentials. The owner's actual browser cookie was not read; browser/page behavior was separately verified against a local authenticated fixture.

## Fix

- Updated the ignored local `.env.local` with the existing collection-ID overrides. No generated table ID is hardcoded in application code.
- Added `/api/customer/admin/access` to check authorization independently of operational dataset reads. It uses the same authenticated identity and exact `user.labels?.includes('amesadmin') === true` decision as the other admin APIs. Operational APIs continue to reauthorize each request.
- Admin data loads settle independently, with 15-second per-source timeouts, array validation and safe dataset status/reason codes. Failed dataset totals are omitted, not shown as zero. Successful empty datasets produce real zero counts and empty arrays.
- The authorized shell renders even when dashboard data is unavailable. Refresh can retry; refresh failures preserve navigation and mark previous data as potentially stale.
- Each section shows relevant unavailable-source messages. Empty applications, inventory, matches, requests, audit events and uploads have explicit empty states.
- A section-level React error boundary contains unexpected rendering errors without removing navigation. Changing section or refreshing resets it.
- Videos remains independent of the aggregate API. Invalid list responses and unavailable product-link data no longer break its surrounding dashboard. Existing upload, publication, approval and private media rules are unchanged.

## Existing jeweller row compatibility

The live record has `kind: "JEWELLER_PROFILE "` (including a trailing space), a valid JSON payload, and `verificationStatus: "VERIFIED"`.

Accepted kinds are now **JEWELLER_APPLICATION** and **JEWELLER_PROFILE**, with surrounding kind whitespace ignored for recognition. Case is not relaxed. This shared predicate is used by portal/session linkage, the admin dashboard, application listing and admin review. New application submissions still write JEWELLER_APPLICATION. Existing rows retain their original kind and row ID, including during profile edits and audited review; reading does not rewrite or duplicate them.

Portal authorization still requires exactly one recognized record whose explicit Appwrite userId linkage resolves to the authenticated user, plus exact `verificationStatus === 'VERIFIED'`. Neither userId nor verificationStatus is whitespace-normalized. Duplicate links deny access. Admin status alone is insufficient. Name, email and company metadata have no authority.

Read-only verification after applying the local table overrides confirmed:

- Both configured tables detected and readable.
- One recognized jeweller record; zero sourcing matches; zero inventory records.
- Exact userId linkage resolves to one existing Appwrite account.
- Linked account has the exact `amesadmin` label.
- Jeweller verificationStatus is VERIFIED and the shared portal predicate allows that linked identity.
- Every admin dataset, including account directory, returned available.

## Required live environment / console settings

Set these **server-side Vercel environment variables** for the intended deployment environment:

```dotenv
APPWRITE_COLLECTION_JEWELLERS=6aa837ef0005388425f1
APPWRITE_COLLECTION_SOURCING_MATCHES=6aa83bd600074e95436c
```

The local equivalents were set. Restart a running local server to pick them up. Vercel settings and the deployed application were not changed by this task; the live deployment will not gain the local mappings/code automatically. No push or deployment was performed.

Do not recreate the tables or add duplicate indexes. Existing `userId_idx` and `kind_idx` index names work: these reads do not depend on index names and do not query JSON business fields through native columns.

Observed physical schema: userId String(128), assetId String(128), kind String(64), payload String(65535), updatedAt Datetime; assetId is optional, the others required. Those differences from the generic provisioner's exact sizes/requiredness do not block the current gateway: it always writes assetId and limits JSON to 60000 characters. Do not run the generic provisioner to force a schema recreation.

Both tables are enabled and their table permission lists are empty, but **Row Security is currently disabled**. Enable Row Security on each existing table to match the repository's private-table contract and health check. Keep table permissions empty and row permissions private; do not add public or general authenticated-user access. No live permission changes were made. No storage changes are required.

## Owner metadata

Admin Dashboard -> System / Audit -> **About AMES**:

| Field | Value |
| --- | --- |
| Owner | Same Thwabi |
| Product | AMES |
| Company | AMES DE BRILLIANTE |

This is presentation metadata only, rendered in the protected admin section. It is absent from the public Chat/Boutique/Video interface and is never used for authentication, account lookup or privilege grants.

## Validation

- Production build: passed.
- Full tests: **106/106 passed**.
- Browser fixture: guest/customer denied; exact admin allowed; all eight dashboard sections render with empty data; malformed event JSON isolates only that dataset; empty sourcing/inventory are readable; video file upload and draft save work; the legacy userId-linked VERIFIED profile opens the portal; refresh failure preserves the shell; owner metadata appears only under System / Audit. No browser errors.
- Mobile and desktop About screenshots inspected. Measurements/screenshots: `outputs/admin-resilience/` (ignored test artifacts).
- `git diff --check`: passed.
- Live checks were read-only; no live table, index, row, label, bucket or permission was created, modified or deleted.

## Files changed

- `src/app/admin/page.tsx`
- `src/app/admin/AdminConsole.tsx`
- `src/app/admin/SectionBoundary.tsx`
- `src/app/admin/VideoSection.tsx`
- `src/lib/customer/admin-dashboard.mjs`
- `src/lib/customer/jeweller-record.mjs`
- `src/lib/customer/jeweller-service.mjs`
- `src/lib/customer/service.mjs`
- `tests/admin-dashboard.test.mjs`
- `tests/dashboard-access-check.test.mjs`
- `scripts/verify-admin-resilience.mjs`
- `docs/admin-rendering-owner.md`
- `.env.local`: ignored local configuration only; excluded from the commit.

Pre-existing changes to `next-env.d.ts` and the untracked `docs/appwrite-jeweller-live-setup.md` were preserved outside this commit.
