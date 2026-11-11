# Mobile gemstone optics revision 0.1.33

Status: implementation and CPU tests passed; real-device appearance and frame rate require review. This is not a claim of photorealism.

## Findings

The previous phone budget was five internal intersections for centre stones and three for melee; desktop used ten and six. The BVH shader correctly discards light still trapped when its budget ends, so reducing that budget darkened mobile stones. A CPU ray measurement on the engine's round brilliant, with a uniform white environment, found the three-bounce budget recovered 54–80% and five recovered 71–87% of a 24-bounce reference across face-up, 35° and 65° views. These are aggregate transport measurements, not measured screen brightness.

The diamond environment additionally used a 0.12 room fill, six broad black horizon panels and a broad 90% camera obstruction. Coloured stones had half-strength surface environment reflection and roughness 0.045.

## Changes

- Settled centre stones: 16 internal intersections on both phone and desktop. Melee: 12. Phone melee uses one spectral ray rather than three.
- Motion: eight centre / six melee intersections, one spectral ray each. The detailed frame is requested 180 ms after interaction stops, without accumulating previous frames.
- Per-material quality updates replace the global mutable gemstone budget; simultaneous viewers no longer set each other's budget.
- Settled pixel ratio capped at 2 instead of 3 on phones; moving touch ratio remains 1.25. This trades some raster resolution for internal optical depth.
- Diamond tent fill 0.65, broader white side sources, three narrow charcoal flags, smaller camera obstruction. Metal environment and the previous softer watch finish are retained.
- Coloured gemstone surface reflection restored to full environment intensity, polish roughness 0.012, white dielectric surface. Absorption colours and distances remain unchanged.
- Bracelet drag deformation and temporal accumulation remain disabled.

## Validation

`node --test scripts/test-studio-optics.mjs scripts/test-ames-boutique.mjs`: nine passing tests. The new centre budget recovers over 96% of the 24-intersection reference at all three tested angles. Uniform transitions preserve BVHs and shader cache keys; separate material instances retain their own budgets.

`AMES_QA_LOW_MEMORY=1 npm run build`: passed compilation, TypeScript and static generation.

Limitations: the CPU measurement does not include the HDR environment, GPU precision, absorption, occlusion by settings, or phone frame rate. The available browser has no working WebGL; local Chromium also cannot start under this execution environment. No mobile visual pass is claimed. Review the diamond, amethyst, watch and bracelet at rest and during rotation on a real phone before accepting the appearance.
