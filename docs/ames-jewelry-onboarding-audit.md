# AMES jewelry onboarding audit and merged workflow

Status: historical architecture audit. The subsequent implementation is documented in ames-jewelry-onboarding.md.

## Existing onboarding

| Concern | Current path | Finding |
| --- | --- | --- |
| Partner/vendor application | `/partner` → `POST /api/partner` → Appwrite `traders` | Collects name, business/contact details and optional licence evidence; creates a `Pending` trader. |
| Staff review | `/dashboard` Traders tab → `/api/traders/approve` or `/api/traders/decline` | Changes trader to `Active` or `Declined`; approval issues a portal code. Staff has `owner` and `cousin` roles, but there is no jeweller-specific role or verification state. |
| Vendor catalog submission | `/trader/[code]` → `/api/stones/photos` and `/api/trader/[code]/stones` | A trader can choose `Jewelry`, but submission still creates a `stones` document and requires carat, color, shape/description, and three photos. It has no engine identity or 3D upload. |
| Product review | `/dashboard` Stones tab → `/api/stones/approve` | `Pending` stone becomes `Available` or `Rejected`; `Available` is an inventory state, not engine or visual approval. |
| Public catalog | `/api/stones` and trader public profile | Stone listings are Appwrite records. The current Chat/Boutique/Media engine views instead load versioned JSON contracts from `public/ames-engine`. Stone approval does not publish an engine pack. |
| Other roles | `/login`, `/model/[code]`, `/request`, `/app` | Staff access codes, model portal, buyer sourcing request, and consumer app exist. No customer registration or jeweller-specific onboarding was found. |

The active backend schema is auto-provisioned by `src/lib/appwrite.ts`; `schema.sql` is reference documentation, not executable SQL. Existing relevant collections are `traders`, `stones`, `stone_status_log`, `videos`, `models`, and `staff`. The `media` bucket allows images up to 10 MB; `licence-docs` allows images/PDF up to 20 MB; `reports` allows PDFs. None is a suitable 3D source bucket. The videos upload route accepts MP4/WebM/MOV at the API level, but the existing `media` bucket definition is image-only.

## Correlation with the engine workflow

1. **Entry point:** The partner trader application and staff approval can serve jewelry vendors. `Active` means AMES accepted the partner; it does not establish gemstone, material, or product claim verification. Reuse the existing `traders.$id` as the vendor ID.
2. **Product identity:** A `stones` document can be labelled `Jewelry`, but its required carat/color fields and defaults (including `D` in `/api/stones`) can create false jewelry claims. It should not be used as the master engine product record without a disruptive migration.
3. **Uploads:** Existing storage supports images and PDFs, not GLB/OBJ/FBX/ZIP. A private source bucket is required. Photos and supporting documents may use the existing image and licence-document upload mechanisms only where access and size rules fit.
4. **Approval:** `traders.status` (`Pending/Active/Declined`), `stones.status` (`Pending/Available/Rejected/...`), and model-video approval describe different objects. None expresses `submitted → processing → technical_review → visual_review → approved → published/rejected` for one jewelry piece.
5. **Status reuse:** Reuse trader approval for vendor eligibility. Preserve stone inventory status for stones. The jewelry record needs its own process status because `Available` and `Reserved` are not rendering/review states.
6. **Publication:** Engine contracts already carry `publicationStatus` and `visualApproval`; the sync scripts validate that `published` implies `approved`. They currently copy review packs for preview, and the app labels them accordingly. No staff approval action is linked to that sync.
7. **Cross-surface identity:** Chat, Boutique, and Media already share `assetId` and `revisionId`. A product record can reference those IDs and the pack hash. No per-asset screen code is needed.

## Proposed single workflow

`Partner application → staff approves existing trader → internal Add Jewelry Piece → private source upload → handoff manifest with productId/vendorId/source hashes → AMES Engine processing outside the app → pack import and validation → technical review → visual review → approve or request revision/reject → verify approved pack contracts and hash → generic sync → Chat/Boutique/Media.`

The existing trader remains the vendor identity. A jewelry product document is the single catalog identity for that piece. The engine `assetId` and current `revisionId` attach to it; the existing contract indexes then carry the same asset into all three app views. The app should not run geometry or material qualification itself. The handoff initially remains an explicit operator step because the engine is a separate project with no app-to-engine job API.

## Minimum schema and app surface proposed

- One private Appwrite `jewelry-sources` bucket accepting GLB, OBJ, FBX, ZIP, images, and PDF with explicit size and extension checks. Store file IDs and SHA-256 values, not public source URLs.
- One `jewelry_products` collection. Use the Appwrite document ID as `productId`. Fields: `trader_id`, `name`, `category`, `workflow_status`, `asset_id`, `revision_id`, `pack_hash`, `visual_approval`, `publication_status`, `source_manifest` (file IDs/names/hashes), optional photo/document references, optional verified commercial metadata, review reason, and timestamps. Keep unknown price, metal, stone, carat, scale, and certification absent.
- One owner-only Jewelry section in the existing dashboard, reusing its navigation and visual language. It selects an `Active` trader, submits source files, lists processing evidence from a linked pack, opens the existing GLB/image/video previews, and records review decisions.
- A small server API for product creation/upload, pack attachment, and guarded status transitions. The server checks the signed staff session and owner role; it must never trust a client-supplied approval flag or allow `published` unless the attached pack contracts agree on identity/revision and `visualApproval === approved`.
- Keep `sync:ames-content` generic and assetId-scoped. Review packs may remain available as explicitly marked local previews; the production publication step must require the approved product and approved pack revision. Do not equate file copy with commercial publication.

### Identity and status

`traders.$id (vendorId) → jewelry_products.$id (productId) → assetId → revisionId → packHash`.

`workflow_status` is internal: `submitted`, `processing`, `technical_review`, `visual_review`, `approved`, `rejected`, `revision_requested`, `published`. `publication_status` mirrors the accepted pack's `review` or `published`, and `visual_approval` mirrors `pending`, `approved`, or `rejected`. These are distinct: technical validation does not grant visual approval, and approval does not automatically publish.

## Blockers before implementation

- This is a significant Appwrite schema and private storage change. The request's Phase 7 explicitly asks for this report first and implementation of only the approved/minimum architecture.
- The local Appwrite endpoint is a placeholder/local value, so live collection, bucket, upload, and approval transitions cannot be exercised against production from this checkout.
- Existing engine packs are review/pending; none can pass a commercial publication gate yet. An operator or engine process must produce a contract revision marked visually approved before publishing.
- The old trader/stones APIs use portal-code lookup and some catalog routes sit outside the dashboard middleware matcher. The new jewelry write routes must use server-side staff authorization and private source storage; the old flows should not be reused as security gates for 3D uploads.
