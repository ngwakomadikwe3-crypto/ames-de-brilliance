# Dashboard access and stone label

## Confirmed live backend findings

Read-only checks used the existing configured Appwrite project and database. No account details, IDs, emails, passwords or session tokens were printed.

- Accounts: 1.
- Accounts with non-empty labels: 1.
- Accounts with exact amesadmin: 1.
- jeweller_sources: HTTP 404 / table_not_found.
- sourcing_matches: HTTP 404 / table_not_found.
- user_profiles, catalog_assets and analytics_events: available.

The existing account has the required admin label; adding an alternative label or email rule is not the remedy. The admin dashboard cannot load its required application/match data because those two configured tables are absent. Jeweller linkage and verification cannot be resolved because jeweller_sources is absent.

These are confirmed backend blockers, not a claim that the owner's exact browser request was captured. The owner browser was not connected to the available browser tools. The requested signed-in session result was not supplied during implementation. Therefore:

| Requested observation | Observed result |
| --- | --- |
| Owner browser authenticated | Not directly observable here; owner reports successful sign-in |
| Account labels present | Yes, in the server-key Appwrite account directory response |
| Exact amesadmin present | Yes, in that account response |
| Browser Account.get/session admin value | Not directly observed; do not substitute directory data for this check |
| Linked jeweller record found | Lookup unavailable: configured table does not exist |
| verificationStatus | Unavailable, not a fabricated status value |

Anonymous reads of the configured live /admin and /jewellers/portal now show the newer sign-in-required screens. The earlier generic deployed screens reported in previous passes are no longer the observed state. This pass was not pushed or deployed.

## Code trace and changes

Login creates a fresh Appwrite session. The browser sends its HttpOnly customer cookie to customer/session and protected APIs. Server identity calls Appwrite Account.get with that session on each request, checks account/profile enabled state, and derives admin from user.labels?.includes('amesadmin') === true. The full label array is deliberately omitted from the public session projection; the derived admin flag is retained. This is not a loss of authorization state. The page calls the same admin API service; authorization remains server-side and uncached.

A legacy email fallback in jewellerAccess was removed. Portal access now requires exactly one JEWELLER_APPLICATION whose userId equals the authenticated Appwrite user ID, with verificationStatus VERIFIED. Contact email changes do not grant or revoke access. Admin role does not substitute for a jeweller link. The admin user-directory linkage display uses the same ID rule.

New authenticated applications retain the submitting session's userId. Guest applications remain possible, with no inferred ownership; an explicit verified account link must be added before portal access. Submitted user IDs/emails cannot override the session-derived link.

Missing dashboard tables now produce an unavailable/setup message, distinct from missing admin label or unverified application. Existing portal reasons remain distinct: not signed in, no linked application, APPLIED, UNDER_REVIEW, REJECTED, SUSPENDED, and not verified (including ambiguous multiple links).

GET /api/customer/access-check is a safe current-session diagnostic: authenticated, labelsPresent (non-empty labels), amesadminPresent, adminAllowed, and jeweller linkedRecordFound/verificationStatus/allowed/reason. No IDs, email addresses, label names other than the required boolean, or secrets are returned. It uses no-store and the same server identity/linkage path. Missing jeweller data yields unknown/null fields rather than invented false verification. This new endpoint is available only once this commit is separately rolled out.

## Exact manual Appwrite setup

Do not change the existing account's admin label: the required label is already present in the checked project. Do not grant admin by email.

In the existing configured database, provision the missing IDs jeweller_sources and sourcing_matches using the existing customer schema. If an equivalent existing table has a different ID, verify its schema and set the matching existing environment override instead of duplicating records:

- APPWRITE_COLLECTION_JEWELLERS
- APPWRITE_COLLECTION_SOURCING_MATCHES

Each table must have empty table permissions, row/document security enabled, and these required columns:

| Column | Type |
| --- | --- |
| userId | string, 128 |
| assetId | string, 128 |
| kind | string, 64 |
| payload | string, 60000 |
| updatedAt | datetime |

The existing provisioning contract creates key indexes by_userId, by_assetId, by_kind and by_updatedAt on those respective columns. See scripts/provision-customer.mjs; its default is dry-run. Applying setup needs a provisioning key in the operator's environment, never client code. Do not change public bucket/collection permissions or replace the project/database.

After the table exists, restore or submit the real jeweller application through the existing workflow. Its top-level userId must be the verified intended account's Appwrite user ID; kind must be JEWELLER_APPLICATION. Complete admin review before setting verificationStatus VERIFIED in its payload. Do not create a fake business record or self-approve an unreviewed jeweller. There must be exactly one matching record; resolve duplicates and stale/conflicting userId copies explicitly. Creating the tables alone does not establish a verified jeweller.

Confirm the owner is using the same origin/project as the checked deployment. For a signed-in live check, inspect only user-is-null and user.admin from /api/customer/session, without sharing the full response. After this commit is rolled out, access-check provides the safe diagnostic fields directly. No live setup, linkage, verification or deployment changes were performed by this task.

## Stone label

Owner-reported before: Round Brilliant - Diamond. Current local code previously displayed a single-line middle-dot version. After: Round Brilliant on the primary line, Diamond on the secondary line. Primary is Geist Sans 14px / 500 / white .92; secondary 11px / 400 / white .58. Centered, tight spacing, no uppercase transform, letter spacing, glow, border or badge. Only the label JSX and scoped label CSS changed; renderer logic and the stone itself did not.

## Validation

Production build and 99/99 tests passed. Focused production browser/SDK checks passed for page/API agreement, exact admin label, separate jeweller gate, email-only denial, pending denial, safe diagnostics, Geist label styling, centered label and mobile layout; no browser errors. Mobile screenshot visually reviewed. The existing sign-in browser regression also passed against the updated explicit-ID fixtures, including fresh admin/jeweller login, registration and logout. git diff --check passed.

## Exact files changed

- src/app/admin/page.tsx
- src/app/jewellers/portal/page.tsx
- src/app/globals.css
- src/components/AmesEngineSurfaces.tsx (label JSX only)
- src/lib/customer/admin-dashboard.mjs
- src/lib/customer/jeweller-service.mjs
- src/lib/customer/service.mjs
- tests/dashboard-access-check.test.mjs
- tests/customer.test.mjs
- tests/inventory-upload.test.mjs
- tests/jeweller-dashboard.test.mjs
- scripts/verify-dashboard-access-stone.mjs
- scripts/verify-account-presentation.mjs
- scripts/verify-admin-dashboard.mjs
- scripts/verify-admin-video.mjs
- scripts/verify-jeweller-dashboard.mjs
- scripts/verify-sign-in.mjs
- docs/dashboard-access-stone.md

Existing fixture changes supply explicit userId ownership instead of relying on email matching.
