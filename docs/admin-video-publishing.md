# AMES admin video publishing

## Architecture discovered and preserved

Jeweller applications live in the existing `jeweller_sources` table; approved catalog assets live in `catalog_assets`. Both use the existing customer gateway JSON payload contract. An authenticated account is linked to its jeweller application by its verified Appwrite account email. Only `VERIFIED` applications may submit. The jeweller dashboard now saves new inventory and editable changes as `DRAFT`; explicit submission enters `PENDING_REVIEW`, with catalog `status: draft`. Admin approval requires the exact `amesadmin` Appwrite label and rechecks jeweller verification. The original application-ID lookup during approval was incorrect and is fixed. Inventory IDs now survive gateway serialization, publication, Favorites, Reserve, and handoff.

The form captures name, description, SKU, category, optional stone/certificate data, metal/style, price/currency, availability/quantity, delivery information, provenance/source, image URLs (main first), optional video URL, and optional GLB URL. The jeweller dashboard now supports private Appwrite binary media uploads and preserves existing HTTPS references. See `jeweller-dashboard.md` for current upload and access rules. Diamond fields are optional. Main/additional images and supplied videos/GLBs are inspectable during admin review.

## Exact category placement

Stored controlled category labels are `Rings`, `Watches`, `Bracelets`, `Necklaces`, and `Earrings`. Existing singular engine keys remain accepted for compatibility. The public adapter maps these labels to `ring`, `watch`, `bracelet`, `necklace`, and `earring` for the existing engine.

Public inventory requires BOTH `status === published` and `inventoryStatus === APPROVED`. Boutique reads that catalog, selects jeweller inventory, and compares its category key by exact equality. All other inventory statuses are excluded. The active category hero takes its first approved item. Explore follows the active category. Empty categories show the source/empty state, with no fixed-ring fallback. Canonical stone assets used by the existing stone renderer remain available; canonical jewelry is no longer merged in as fallback stock.

The catalog projection preserves approved product metadata and jeweller linkage for SAME, Video, Favorites, and Reserve. SAME does not substitute its legacy name-based price/specification defaults for jeweller inventory. Removing approval blocks new public queries, reserve, and handoff. Existing clients refresh Boutique when entering it or pulling to refresh; already downloaded media cannot be recalled.

## Video architecture

Reuses `videos`, `/api/videos`, `/api/videos/upload`, and `media`. The `/admin` Video editor supports upload, thumbnail upload, preview, optional title, required caption, an approved public catalog link, drafts, publication, archiving, editing, featured status, numeric ordering, and archived-record deletion.

Server handlers recheck Appwrite identity and exact `amesadmin` membership for every metadata write, upload, and private preview. Legacy staff and model cookies alone do not authorize these operations. Same-origin writes are required. Type/signature, file size, private bucket configuration, storage references, and public approved product links are validated. Admin-created private files are marked by a server-generated filename prefix. All AMES admins may manage these files; customers/jewellers cannot create them.

Uploaded bytes stay private in `media`. Metadata remains in `videos`, using existing columns plus one JSON string column. Public feed includes only `PUBLISHED`, ordered featured first, ascending sort order, then newest creation. Product links resolve live; unavailable/private products lose their public link and context. Video delivery forwards byte ranges and rechecks publication on each request. Draft/private previews require admin. Archive removes feed access and guest streaming. Safe deletion removes archived metadata only; storage files remain to avoid deleting a shared/referenced upload.

Upload cap: the smaller of the bucket maximum and **4 MiB** per file. The conservative cap fits the existing Next server upload path. Larger films must be compressed. No direct client upload credential or server secret is exposed.

## Required Appwrite Console setup (not applied to live Appwrite)

1. In the existing `ames` database, open the existing `videos` table/collection.
2. Add an OPTIONAL string column/attribute: key `metadata`, size **8000**, default empty string. Wait for its status to become `available`.
3. Keep table permissions empty and row/document security enabled. Keep the existing `media` bucket enabled, with file security enabled and bucket permissions empty. New video files have no public file permissions.
4. Confirm the bucket allows `mp4`, `webm`, `mov`, `jpg`, `png`, and `webp` if it uses an extension allowlist. Keep existing allowed formats (including inventory/3D formats). Do not replace or recreate the bucket.
5. Ensure the existing server API key retains table/row read/write and storage file read/write access. Never add that key to a client/public environment variable.

No new collection, bucket, database, environment variable, or migration is required. The development provisioning definition includes the new column; production requests do not provision infrastructure. Existing legacy `Live` rows are not automatically published. An admin must re-upload legacy external/public videos through the private upload path, review, then publish with the new statuses. Existing legacy counters/comments remain stored.

No indexes are added: this implementation paginates the existing tables and filters/sorts server-side, matching the customer gateway approach. It does not query JSON fields as Appwrite columns. Lists fail closed above 5,000 rows rather than silently returning partial inventory.

## Validation

- Full Node test suite: inventory verification, all five categories, all non-public statuses, shared IDs and leads, video authorization and status transitions, approved links and revocation, storage reference validation.
- Production Next build and TypeScript check.
- `node scripts/verify-admin-video.mjs`: local production server + actual node-appwrite SDK against an isolated test HTTP backend; uploads the existing intro film, tests draft/public/archive streaming, admin editing, and mobile/desktop playback with inline playback and pause-on-exit.
- Browser screenshots and checks: `outputs/admin-video/` (local artifacts, not committed).
- `git diff --check`.

Live Appwrite schema/application validation remains dependent on the manual column setup above. No live records/files were created, no push, and no deployment.

## Exact files changed

- `docs/admin-video-publishing.md`
- `scripts/verify-admin-video.mjs`
- `src/app/admin/AdminConsole.tsx`
- `src/app/admin/VideoSection.tsx`
- `src/app/api/videos/[id]/media/route.ts`
- `src/app/api/videos/files/[id]/route.ts`
- `src/app/api/videos/route.ts`
- `src/app/api/videos/upload/route.ts`
- `src/app/app/page.tsx`
- `src/app/jewellers/portal/InventorySection.tsx`
- `src/components/AmesEngineSurfaces.tsx`
- `src/components/CustomerState.tsx`
- `src/components/jewelry/BoutiqueJewelryStage.tsx`
- `src/lib/appwrite.ts`
- `src/lib/buying-intelligence.ts`
- `src/lib/customer/appwrite.mjs`
- `src/lib/customer/service.mjs`
- `src/lib/inventory.mjs`
- `src/lib/legacy-policy.mjs`
- `src/lib/video-media.ts`
- `src/lib/video-service.mjs`
- `src/lib/videos.ts`
- `tests/appwrite-fixture.mjs`
- `tests/customer.test.mjs`
- `tests/videos.test.mjs`

## Final results

Production build and TypeScript: passed. Full suite: 72/72 passed. Local SDK/browser integration: passed for upload, draft/public/archive access, admin editor save/unpublish, mobile/desktop playback, category isolation, empty hero, and Explore. `git diff --check`: passed. Existing Node module-type warnings remain non-fatal.
