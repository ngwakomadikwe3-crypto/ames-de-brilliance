# Jeweller inventory media

Extends the existing verified jeweller dashboard and admin review. No new collection, environment variable, renderer, converter, or public product copy.

## Storage and roles

Uses `jeweller_sources` for verified ownership, `catalog_assets` for existing JEWELLER_INVENTORY and JEWELLER_MEDIA JSON payloads, and the existing private `media` bucket. Binary content stays in Storage.

The existing `media` array remains backward compatible. Each entry has `assetRole`: mainImage, gallery, detail, video, web3d, or cad; plus fileId, fileName, mimeType, extension, size, uploadedAt, uploadedBy, visibility and reviewStatus. Metadata is resolved server-side from the upload record, never accepted from client assertions. Legacy uploads may have unknown size/name. Uploads can be staged before the first draft; supplied product IDs must belong to the verified jeweller and be editable. Attachment always verifies ownership.

CAD visibility is PRIVATE at upload and after approval. Its reviewStatus remains PENDING_REVIEW for internal review; product approval does not certify manufacturing source files. Display assets begin REVIEW_REQUIRED, become PUBLIC on product approval and lose public access whenever the product leaves APPROVED. The product record is the publication authority; upload records retain their original review state.

Public product serialization excludes the media array entirely and only returns display image/video/web3d references. CAD downloads recheck authenticated owner plus VERIFIED status, or the exact amesadmin label. Downloads force application/octet-stream, attachment disposition, no-store and nosniff. Bucket and file permissions are checked by the existing gateway on upload/read.

## Supported files

- JPEG, PNG, WebP: main, gallery and detail images (12 images total).
- MP4, MOV, WebM: one optional video.
- GLB or GLTF: one optional self-contained glTF 2.0 model, without extensions. External relative/remote resources are rejected. GLTF buffers/images must be embedded. This deliberately supports a restricted subset of the [Khronos glTF specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html).
- CAD: 3DM, binary/ASCII STL, OBJ, STEP/STP, IGES/IGS, binary FBX. Structural/header checks and extension/MIME allowlists are applied. These are source-file checks, not full CAD parsing or manufacturing certification.
- DWG, DXF and ASCII FBX are not enabled. No existing safe parser/converter was available in this workflow.
- 4 MiB per file, matching the existing application upload cap; 24 total attachments. Smaller bucket limits still apply.

Admin review retains image/video previews, adds an on-demand existing web 3D viewer and private CAD filename/type/size/download actions. Jewellers can download their private sources from inventory details. Boutique uses approved images when no model is supplied. CAD is never fed to a renderer.

## Appwrite console

No schema migration or indexes required: metadata uses the existing JSON payload column. No live Appwrite settings were changed.

Verify `media` is enabled, file security is enabled, bucket permissions are empty, and uploaded file permissions remain empty. Never add public bucket read access. If an extension allowlist is configured, allow jpg, jpeg, png, webp, mp4, mov, webm, glb, gltf, 3dm, stl, obj, step, stp, iges, igs and fbx. Keep maximum size at least 4 MiB if these uploads should reach the application cap. Preserve existing antivirus/security settings.

## Validation

Automated tests cover CAD upload authorization, metadata spoofing, cross-jeweller attachment, format rejection, self-contained GLTF, and private CAD after product approval. The local SDK/browser fixture exercises mobile CAD upload, draft submission and protected admin download without creating live inventory.
