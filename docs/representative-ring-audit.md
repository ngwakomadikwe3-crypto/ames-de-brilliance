# Representative-ring audit and handoff — 25 October 2026

Scope: existing AMES application, one ring (`dev-test-candidate-ring:2`), no deployment, no paid provisioning, no source deletion and no commercial approval. Existing dirty work was retained. No dependencies were added; `package.json`, the lockfile and the vendored engine were not changed by this audit.

## Findings and priorities

| Priority | Evidence | Finding and action |
| --- | --- | --- |
| P1 | `src/components/EngineJewelryViewer.tsx` | Engine load failure/context loss had no explicit recovery; actual context loss produced an empty silk stage. Added a component error boundary, 30-second loading fallback, captured context-loss handling, still preview and retry. Failed GLTF cache entries retry under a fresh URL for the same asset. Missing poster falls back to readable text. |
| P1 | Ring `app/media.json`, `asset-media-v1.json`, `boutique-media-v1.json` | Media pinned revision 1 while live Chat/Boutique used revision 2. Archived that media contract, retained all files, and switched the active ring feed to a current revision-2 render. Older videos are withheld, not relabelled as revision 2. |
| P1 | `src/components/ChatVisualStage.tsx`, ring `app/chat.json` and `app/boutique.json` | Hero/macro imagery could show the older center geometry. Shared the current derived render across Chat/Boutique/Media. Ring Macro now inspects the live setting with zoom. Poster height follows the engine's vertical-FOV framing to avoid a portrait-view size jump. |
| P2 | `scripts/audit-representative-ring.mjs`, `geometry.json` | 50 parts, 88,531 vertices, 158,518 triangles; finite coordinates, unit-length normals within tolerance and no triangles below the stated degeneracy threshold. Geometry and original GLB hash are unchanged. These checks do not certify topology, dimensions, manufacturability or gem identity. |
| P2 | `src/lib/jewelry-workflow.ts`, `src/lib/jewelry-products.ts`, `src/lib/jewelry-pack.ts` | Real Appwrite identity/source hashes and technical/visual/publication gates exist. Complete operator packs are still required; raw conversion outputs do not automatically become published products. No product approval or database record was changed. |
| P2 | `scripts/cad/worker.mjs`, `sandbox.mjs`, `deploy/cad/` | Actual local Blender worker and hosted adapter exist. Production sandbox code requires a pinned image, non-root Linux user and restricted container. Docker is unavailable here; Linux hosting remains unverified. |
| P2 | `README.md`, `src/lib/appwrite.ts`, `src/lib/db.ts`, `schema.sql` | README incorrectly described SQLite/Supabase deployment. Corrected it to Appwrite, signed AMES sessions, Dify SAME, separate dashboard AI, private CAD and actual product limitations. Historical npm name retained to avoid unrelated dependency churn. |

## Ring geometry and optics

The source GLB is 2,740,056 bytes; SHA-256 `97cbef4074acf745e2261a342566da4e880fe7ec83d2c00f9c6cccb002ae6c3f`. Geometry buffer views total 2,684,928 bytes, with no embedded image textures. Unverified source-unit bounds are approximately 1.382 × 1.673 × 0.460. No conversion to millimetres or carats is justified.

The metal source has metallic factor 1 and roughness approximately 0.16, with a gold-colour intent but no certified alloy. Center/closed-gem materials carry transmission and IOR extensions. The tagged `C00` center uses the supplied reference geometry; it is not replaced by a newly invented stone in this work. The engine's special center path and SAFE material are in the vendored `MountedCenterDiamondMaterial.tsx`; the general material/geometry paths are in `JewelryGlbModel.tsx` and `jewelryGlbMaterials.ts`.

SAFE deliberately avoids the expensive multi-bounce refraction path. It preserves interaction at lower pixel density and approximates gemstone reflections/transmission. It does not reproduce spectral dispersion, diamond grading, manufacturing-scale light transport or physical stock photography. Strong dark metal reflections, simple SAFE facets and unresolved melee optics remain visual-review issues. The result is a more consistent, recoverable preview—not a claim that luxury photorealism or jeweller approval has been achieved.

The new 1024 × 1024 transparent image is an actual engine canvas capture from this GLB, using its unchanged environment, three-quarter camera, zoom 1 and SAFE tier. See `render-provenance.json` for source, image and engine-archive hashes. This is a render, not a photograph. No image-generation model or substitute jewellery asset was used.

## Before / after evidence

Matching comparison conditions: Chromium, desktop 1440 × 1000 DPR 1 or mobile touch emulation 390 × 844 DPR 3, forced SAFE tier, reset three-quarter camera, stopped turntable, unchanged engine lighting and silk background. Mobile screenshots are 1170 × 2532 physical pixels. Dev-server badges may differ. Media intentionally changes from an old video frame to the current still; it is not a controlled optics comparison.

| Comparison | Before | After |
| --- | --- | --- |
| Desktop Chat | [before](qa/representative-ring/before/desktop-chat.png) | [after](qa/representative-ring/after/desktop-chat.png) |
| Mobile Chat | [before](qa/representative-ring/before/mobile-chat.png) | [after](qa/representative-ring/after/mobile-chat.png) |
| Mobile Boutique | [before](qa/representative-ring/before/mobile-boutique.png) | [after](qa/representative-ring/after/mobile-boutique.png) |
| Mobile tile | [before](qa/representative-ring/before/mobile-boutique-tile.png) | [after](qa/representative-ring/after/mobile-boutique-tile.png) |
| Mobile Media | [before](qa/representative-ring/before/mobile-media.png) | [after](qa/representative-ring/after/mobile-media.png) |
| Lost graphics context | [blank stage before](qa/representative-ring/before/desktop-context-loss.png) | [same-ring fallback after](qa/representative-ring/after/desktop-context-loss.png) |

## Performance evidence and limits

`before/metrics.json` and `after/metrics.json` contain recorded readiness, resource size/duration, canvas dimensions, JS heap and requestAnimationFrame samples. Readiness is navigation-to-live-preview on a local development server and includes compilation/content fetches. Runs are not controlled production benchmarks; do not infer a speedup from them. No mobile CPU/network throttling was applied.

- GLB payload is unchanged: 2.74 MB decoded, observed 1,754,715 encoded bytes per local response. Some dev runs requested it more than once; deduplication and hidden-viewer GPU cost remain follow-up work.
- New shared render is 324,283 bytes versus the previous 1,010,578-byte Boutique hero (about 68% smaller). It is larger than the old 229,162-byte Chat poster; this is a consistency/detail tradeoff, not a universal payload reduction.
- The former ring videos total 7,036,275 bytes on disk. They remain preserved but are not requested by the current ring Media contract.
- SAFE canvas measured 608 × 440 desktop and 310 × 371 mobile. Final measurements: approximately 16.7 ms median on both viewports; 16.8 ms desktop / 33.3 ms mobile p95 RAF intervals indicate main-thread scheduling only, not GPU frame rate.
- JS heap values vary with garbage collection, cached modules and multiple contexts. They exclude GPU/native allocations. Geometry buffer size is only a lower bound, not total memory usage.
- Real iPhone Safari, Android hardware, thermal behaviour, GPU memory and production-network performance were not measured. No assertion of physical-device readiness is made.

## Validation

- Production build and TypeScript: passed locally; existing middleware-to-proxy deprecation warning remains.
- Focused ESLint: no errors; two `no-img-element` warnings remain for exact engine render paths.
- Content/visibility tests: 21 passed after updating expected current-render paths.
- Jewellery onboarding/pack and CAD queue/broker checks passed in the 32-test batch. OBJ/STL/FBX fixture conversions passed in actual Windows Blender 5.2.1, replacing the older timeout status in the CAD notes.
- `scripts/test-cad-ring.mjs`: actual ring conversion passed, 50 components / 158,518 triangles, unchanged input hash. Generated output stays private; see `cad-test.json`.
- Browser: desktop and mobile emulation loaded actual ring, Boutique and Media. Actual graphics-context loss, fallback and retry passed. Independently blocked GLB and poster downloads recovered after unblocking/retry. Only Chat history bootstrap is mocked in these visual tests; the engine, GLB, images and content loaders are real.
- Final poster/live silhouette bounds matched within one pixel on desktop and mobile (see `after/metrics.json`). A concurrent build/browser run encountered a Windows QA-profile file lock; browser and final build checks were therefore run sequentially. The final build passed; all 83 server trace manifests were checked and contained zero `.ames-cad` entries. No public deployment was performed.

## What remains external or unfinished

1. A jeweller must verify scale, proportions, stone identities, metal specifications, material intent and visual quality; original asset licence/ownership evidence is not independently established.
2. Restore the expired local Appwrite key through secret management and test authenticated upload → conversion → material review → complete pack → approval → publication. This full cloud flow was not executed here.
3. Review and run the Linux Docker image, TLS broker, private durable volume, resource limits, malformed-file tests, monitoring and backup restore before enabling hosted conversion. Native 3DM/STEP conversion and jeweller self-service remain absent.
4. Re-render matching motion/macro material from the current geometry and obtain human approval before returning it to Media. Retained revision-1 files are review history only.
5. Reconcile these presentation contracts into the configured upstream pack before running `sync:ames-content`; its current copy-based implementation can overwrite local presentation changes. This audit did not write to the sibling engine repository.
6. Billing, payments, bidding and legal/business verification are outside this ring pass and remain unfinished. Device-local Media interactions are not a shared social backend.

## Exact handoff: files changed in this pass

- `src/components/EngineJewelryViewer.tsx`: recovery boundary, loading timeout, context-loss handling, retry, correct vertical poster fit; original engine and SAFE selection retained.
- `src/components/ChatVisualStage.tsx`: ring Macro uses current live geometry.
- `public/ames-engine/dev-test-candidate-ring/app/asset.json`, `chat.json`, `boutique.json`, `media.json`: current derived presentation references; stale viewer-config reference removed; review/pending retained.
- `public/ames-engine/dev-test-candidate-ring/app/media-revision1.json`: preserved previous media contract.
- `public/ames-engine/dev-test-candidate-ring/web/presentation-ring-v2.png`: new derived render; original GLB/images/videos unchanged.
- `scripts/test-ames-chat.mjs`, `test-ames-boutique.mjs`, `test-ames-media.mjs`: expected presentation paths and revision-consistency regression coverage; existing privacy tests retained.
- `scripts/audit-representative-ring.mjs`: structural/size audit.
- `scripts/render-representative-ring.mjs`: reproducible real-engine capture.
- `scripts/verify-representative-ring.mjs`, `verify-ring-fallback.mjs`: screenshots, measurements, framing/context and network recovery checks.
- `scripts/test-cad-ring.mjs`: private actual-Blender ring conversion test.
- `README.md`, `docs/cad-processing.md`, this report and `docs/jewelry-asset-quality.md`: corrected architecture, current evidence, checklist and limitations.
- `docs/qa/representative-ring/`: geometry/render/CAD evidence, before/after metrics and ten screenshots per phase. Build may refresh ignored `tsconfig.tsbuildinfo`; no credentials/private CAD were copied into this evidence.

Preserved: existing uncommitted work, routes, ModelViewer, source assets, SAME privacy, Appwrite sessions, trader identity, onboarding approval gates, silk colours, page turns and mobile SAFE behaviour.
