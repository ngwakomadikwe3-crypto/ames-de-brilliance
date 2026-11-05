# Representative-ring optics review — 25 October 2026

Scope: controlled realtime-rendering experiment for `dev-test-candidate-ring:2`. No deployment, geometry change, product-specification change, publication approval, or claim of stock photography. The existing customer presentation remains on `reference`.

## Decision

**Do not adopt a new live optics profile yet.**

- **Soft Studio is the strongest SAFE candidate** for the next physical-device and human visual review. Its retuned centre stone preserves a clean silhouette while introducing modest internal structure.
- **Clear Crystal is a comparison boundary, not an adoption candidate.** Its higher transmission produces conspicuous streaked/frosted internal reflections in SAFE.
- **HIGH remains Reference for now.** Soft Studio slightly calms metal reflections, but the visible improvement is too small to justify changing the established presentation without further review.

This is a rendering assessment only. It does not establish diamond identity, optical accuracy, alloy, dimensions, manufacturing suitability, or jeweller approval.

## Controlled setup

The unchanged GLB is rendered through the existing engine and silk backdrop. Each profile uses identical cameras and viewports:

- Hero (`three_quarter`), Profile (`side`), and Setting macro (`setting`, zoom 1.7).
- Desktop HIGH and SAFE: 1440 × 1000 CSS viewport, DPR 1.
- Mobile SAFE touch emulation: 390 × 844 CSS viewport, DPR 3.
- One live canvas and one GLB request were asserted for every captured case.
- The review lab is unlinked from customer navigation. Profile, view, and quality controls were exercised in Chromium.

Twenty-seven raw captures and their browser results are under `docs/qa/representative-ring/optics/`.

### Comparison sheets

- [Desktop HIGH](qa/representative-ring/optics/desktop-high-optics-comparison.png)
- [Desktop SAFE](qa/representative-ring/optics/desktop-safe-optics-comparison.png)
- [Mobile SAFE](qa/representative-ring/optics/mobile-safe-optics-comparison.png)

## What changed between profiles

| Setting | Reference | Soft Studio | Clear Crystal |
| --- | --- | --- | --- |
| Reflection room | Existing dark studio | Softer, brighter fill and dark flags | Intermediate fill with stronger contrast |
| Metal roughness | 0.14 | 0.17 | 0.12 |
| Metal environment intensity | 1.60 | 1.45 | 1.70 |
| SAFE centre transmission | 0.20 | **0.32 after retune** | 0.65 |
| SAFE centre thickness | 0 | **0.22 after retune** | 0.60 |
| HIGH centre Fresnel | 0.04 | 0.07 | 0.09 |

The first Soft Studio SAFE candidate used transmission 0.50 and thickness 0.45. Matched captures showed streaked/frosted internal reflections, as did Clear Crystal. Those settings were attributed to the aggressive transmission/thickness combination and retuned to 0.32/0.22. The retuned candidate was re-rendered on desktop and mobile before review.

## Visual findings

### HIGH

- All profiles retain the same silhouette, framing, pavé layout, and metal colour intent.
- Soft Studio produces a marginally smoother metal read; Clear Crystal slightly increases contrast.
- Differences are subtle rather than transformative. No HIGH variant earns adoption from this evidence alone.

### SAFE

- Reference is clean but the centre stone remains comparatively flat.
- Retuned Soft Studio adds restrained internal structure without the strongest streaking artefacts.
- Clear Crystal makes the centre stone more active but less clean, especially in Hero and Setting macro.
- Mobile SAFE remains an approximation, not a reproduction of HIGH's ray-marched internal reflections.

## Implementation boundaries

- `reference` is the default in the engine and `EngineJewelryViewer`; existing Chat/Boutique calls do not request an experimental profile.
- Experimental values are explicit in `opticsProfiles.ts`; no geometry, transforms, source meshes, quality-tier policy, or commercial metadata were changed.
- `/ring-optics-lab` is an internal review surface with working profile/view/quality controls and a render-not-photography notice.
- The vendored engine remains version 0.1.0. Its archive and lockfile integrity were updated together.
- Existing page-aware pause/resume remains intact.

## Verification

- Final Next.js production build passed with TypeScript and all 61 static pages; only the existing middleware-to-proxy deprecation warning remains.
- Standalone `npx tsc --noEmit` passed.
- Focused ESLint passed with zero errors; the existing `no-img-element` poster warning remains in `EngineJewelryViewer.tsx`.
- Optics invariants: **3/3 passed** (`npx tsx --test scripts/test-ring-optics.mjs`).
- Chat **10/10**, Boutique **4/4**, Media **5/5** regression tests passed.
- Final production controls-only browser run: profile, view, and quality controls all passed.
- Capture assertions: 27 matched cases, one canvas and one GLB resource per case, no uncaught exceptions in the capture runs. The existing `/favicon.svg` 404 remains visible.
- Default customer lifecycle re-verified: zero hidden Chat draws on desktop and mobile emulation, positive resume on the same canvas, two canvases total, one GLB request per workflow, and no uncaught exceptions.
- Clean `npm ci --ignore-scripts` validated the final vendored archive and lockfile integrity.
- Ring GLB SHA-256 remains `97cbef4074acf745e2261a342566da4e880fe7ec83d2c00f9c6cccb002ae6c3f`.

## Next review gate

1. Compare Reference and retuned Soft Studio SAFE on physical iPhone Safari and representative Android hardware.
2. Measure real interaction frame times, thermal behaviour, context loss, and GPU/memory behaviour where tooling permits. Draw counts are not GPU-time or energy measurements.
3. Obtain human jewellery/visual review of metal intent and centre-stone appearance.
4. Adopt selectively only if the candidate is visibly better and remains stable; do not require HIGH and SAFE to use the same approximation.
5. If HIGH needs a substantial improvement, run a separate controlled environment/reflection study rather than increasing dispersion or brightness indiscriminately.

No physical-device, GPU-time, thermal, real-stock, licence, manufacturing, or jeweller-approval claim is made by this review.
