# Final Appwrite security migration — 2026-09-08

Plan written before permission changes. Evidence: `outputs/final-security-audit.json`, `outputs/storage-legacy-review.json`, and current `src/app/api`, `src/lib/db.ts`, `src/lib/appwrite.ts`. All Appwrite SDK calls in this app run on the server. Browsers use Next API routes; no browser requires direct table CRUD. Consequently empty table and row ACLs preserve server-key operations, but Next routes also need authorization; table ACLs alone cannot secure an unguarded server proxy.

## Per-table access decisions

All 17 currently have read/create/update/delete(any), rowSecurity=false. All existing rows have empty row ACLs. Remove direct client permissions and enable row security, after installing route guards. No row payloads are changed by the ACL migration.

| Table | Current code paths | Required anonymous behavior | Authorized writes / ownership / internal use |
|---|---|---|---|
| traders | db.ts; /api/traders/*, /api/partner, /api/trader/login, /api/trader/public/[code], /api/trader/[code], /api/trader/profile | Sanitized active public profile; append-only partner application through server | Staff administration; phone+code portal login issues signed, entity-bound session; profile/stock restricted to that trader |
| stones | db.ts; /api/stones/*, store pages, trader stock, order/video joins | Available catalog projection, excluding commissions/private trader details | Staff edits/approval; authenticated trader submits own pending stock; server order workflow reserves stock |
| requests | db.ts; /api/requests, /api/sourcing, AI draft routes | Append-only sourcing inquiry through server; no list/read/update/delete | Staff-only management; inquiries contain private contact details |
| orders | db.ts; /api/orders, reports | No anonymous access: reservation changes stock | Authenticated customer may request reservation at server price; staff reads/updates; no customer arbitrary update/delete |
| reports | db.ts; /api/reports/* | None | Staff/internal generation only |
| stone_status_log | db.ts; trader stock and reports | None | Server-generated transitions, staff and authenticated owning trader read |
| models | db.ts; /api/models/*, /api/model/profile, public profiles | Sanitized active public profile | Staff administration; phone+code portal session bound to model; own profile and pending submissions |
| videos | db.ts; /api/videos/*, /api/models/[code]/videos, public profiles | Published/live video projection and bounded server engagement actions | Staff publish/edit/delete; authenticated model uploads/submits own pending videos; no public arbitrary mutation |
| comments | db.ts; /api/videos/[id]/comments | Published-video comments, append-only validated comment submission | Server creation only; no public update/delete; private contact field excluded from public output |
| chats | /api/chats, /api/chats/[id] | Guest conversational UI stays ephemeral; no shared persisted history | Verified Appwrite owner for list/create/title update. Add optional userId column/index; six old unowned chats remain staff-only, never guessed or reassigned |
| chat_messages | /api/chats/[id]/messages | None | Verify parent chat owner for every read/write. Client may save conversation content but cannot grant entitlements or alter other chats |
| report_issues | /api/intelligence/issues, generate | None | Staff/internal only |
| report_products | /api/intelligence/products, generate | None | Staff/internal only |
| report_orders | /api/intelligence/orders, generate | None | Staff/internal only |
| staff | db.ts; /api/staff, /api/auth/login | Login verifies submitted code on server; no record exposure | Existing signed staff session/admin only; no default credentials |
| usage_log | db.ts; /api/usage, AI routes | None | Server-generated usage, staff-only reporting |
| balances | db.ts; /api/balances | None | Existing privileged staff operations only |

## Storage decision and sequence

Inventory: one `media` bucket, **zero files**; 10,485,760-byte maximum, jpg/jpeg/png/webp/gif only, public CRUD and fileSecurity=false. No content bytes or URLs exist to preserve. Do not create/delete buckets or upgrade the plan. Recheck emptiness immediately before migration; if files appear, STOP storage migration for a compatibility review.

1. Update current public photo/video upload code to explicitly set read(any), with no client writes. Protect upload routes. Keep private customer uploads/files at permissions=[].
2. Configure all four asset classes to resolve to `media` through the existing provider/storage reference abstraction. Asset class/category/access tier/revision remain catalog metadata, not permissions inferred from filenames. AMES Engine continues loading the same signed-delivery API.
3. Enable file security and set bucket permissions=[]; retain name, enabled state, 10 MB maximum, encryption and antivirus. Extend existing extension allowlist with glb, mp4, webm, mov. No public GLB permissions.
4. Test a private GLB using unchanged canonical bytes: anonymous and another user cannot download via discovered Appwrite URL; owner can obtain a session-bound short-lived lease and receive identical bytes; replay and revoked entitlement fail. Test an explicitly public preview remains readable, not writable. Delete only temporary test files afterward.
5. Large video/GLB files above 10 MB remain unsupported by this conservative migration. Do not silently relax limits or move confidential licence/report files to public URLs. The absent historical licence-docs/reports buckets require a separate private document delivery migration if those legacy features are enabled.

## Application compatibility and migration gates

Reuse the TablesDB adapter for legacy server CRUD: the actual key supports table scopes, not legacy collection scopes. Add fail-closed API authorization, owner-scoped chat history and public response projections without visual redesign. Signed trader/model sessions preserve the existing code+phone login flow; previously cached portal pages require login again. Existing unowned chats cannot safely remain globally visible.

Run unit/build validation before remote changes; preserve immutable before-state audit. Migration script uses explicit table allowlist, verifies row ACLs remain empty and refuses unexpected ACL states. Snapshot table definitions before mutation. Add only the chats ownership column/index, wait for availability, do not recreate resources. Retest the nine customer tables unchanged.

Rollback: roll forward a corrected application build. Never restore public CRUD or global chat access as a routine rollback. Original permission metadata is retained for incident review; any permission widening requires explicit owner review. Preserve all real rows/files. The new nullable ownership column is additive and must not be dropped on rollback. Empty-bucket migration has no existing public file URLs to invalidate.

Deployment gate: these repository fixes must be deployed to the actual Vercel application before its legacy server endpoints are considered secured. Remote Appwrite ACL verification alone does not certify an older deployed server. Production origin/signing secrets must be supplied by the owner, not invented. No deployment or plan purchase is part of this run.
