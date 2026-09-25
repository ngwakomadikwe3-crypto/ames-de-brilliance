# AMES jewelry onboarding v1

This extends the existing partner → staff approval flow. An Active trader is selected in the existing dashboard's Jewelry section. The new jewelry_products document is the sole app product record for that engine piece; it does not create a stones record. The Appwrite document ID is productId, and it links traderId → assetId → revisionId → packHash.

## Intake and engine handoff

Staff enters a product name and category and selects an existing Active trader. A unique engine assetId is assigned unless staff enters the ID of a completed pack. Staff uploads at least one OBJ, GLB, FBX, or ZIP source; photos and PDF evidence are optional. The server computes SHA-256 and stores bytes in the private jewelry-sources bucket. File IDs and hashes remain on the jewelry product; raw files have no public URL.

Start processing records that an operator has accepted the handoff. It does not run Blender or claim that a remote job exists. An owner-only handoff endpoint provides product and source identities, hashes, and authorized private downloads for the engine operator. Engine pack discovery uses the same sibling ames-engine-main/dist convention as the existing sync scripts, or AMES_ENGINE_PACK_DIRS / AMES_ENGINE_PACK_DIR when configured.

Attach completed pack verifies matching assetId, category, revision, source hash, technical quality flags, and checksums for every manifest file. The delivery ZIP SHA-256 is stored as pack_hash. A separate content hash locks the reviewed geometry, images, motion, and presentation mapping, so later changes to approval metadata alone can be accepted without silently changing reviewed visuals.

## Review and publication

The workflow is submitted → processing → technical_review → visual_review → approved → published, with rejected and revision_requested branches. All actions are server-side and require a signed staff session with the owner role. The existing stone inventory status is unchanged.

The dashboard previews pack GLB, ecommerce and luxury images, media videos, Chat contract settings, Boutique contract identity, geometry/material summaries, and limitations. Preview routes are owner-only and never serve raw source files.

Publishing requires staff visual approval, technical pass, the same reviewed content, and engine contracts marked visualApproval: approved and publicationStatus: published. The quality report must also record commercial visual approval. Publishing then runs the three existing generic sync scripts and marks the jewelry product published. Current review/pending packs are blocked from this action.

The sync scripts still copy review packs for app previews. Presence in public/ames-engine therefore does not itself mean commercial publication.

## Existing listings and deployment

Existing stones records with listing_category: Jewelry are left untouched. Do not create a second jewelry product for the same physical piece without an explicit link/migration decision. A later migration should map the legacy stone ID to a new product ID, retire the old public listing, and verify the physical identity before assigning an engine assetId.

The new Appwrite collection and private bucket are auto-provisioned by ensureReady() when a configured Appwrite service is available. Production should verify bucket permissions, file-size limits, and the collection's attribute readiness before accepting real source files. The local Appwrite endpoint is a placeholder, so live persistence and production publication cannot be demonstrated in this checkout.
