# Boutique reference recovery

Visual authority: `references/boutique-reference.jpg`. Branch: `recovery/ames-visual`. No deployment or main merge.

## Inventory and selection

The app repository and the linked AMES engine workspace were inspected for GLB, glTF, OBJ, FBX, product records, and previews. Dependency/build folders were excluded from authored-content inventory.

| Existing asset | Finding / decision |
| --- | --- |
| `diamond_ring_candidate_blender.glb` (3,721,224 bytes) | Complete solitaire with basket, prongs and pave shoulders; strongest visually complete existing model. Selected. |
| `generated/ames_ring_oval_hidden_halo_v1.glb` (605,892 bytes) | AMES-generated ring scene includes band, basket, six prongs and twelve halo gems. Render reveals disconnected setting/band. Rejected for customer presentation; no geometry repair or substitution. |
| `solitar_diamond_ring.glb` (5,997,336 bytes) | Imported Sketchfab ring, CC-BY-4.0 metadata, one shared neutral material for aggregate meshes. Not selected because existing material separation is inadequate for this pass. |
| `diamond_ring_candidate.fbx`, `jewellry_ring_5.obj`, `solitaire_ring_v2.obj` | Source-format ring files; not production web previews. No conversion or geometry edits. |
| Canonical stone GLBs | Loose stones, not jewelry. Excluded and unchanged. |
| `benchmark_02.glb` / OBJ | Protected benchmark. Excluded and unchanged. |
| `/demo/ring-*.svg`, placeholder solitaire, loose-stone poster files | Not used in Boutique. |
| Hintspo Crystal Tear / Sky Lady embeds and Jewelshop config records | External/configuration entries rather than available local production jewelry models/previews. Not substituted into the reference composition. |

Usable local category: Rings (one selected complete model). No usable local watches, bracelets, necklaces or earrings. No additional complete local product visual was identified for those categories. Remote listing availability is not claimed: local requests can fail in the restricted environment.

The selected GLB is copied unchanged to `public/models/jewelry/ames-pave-solitaire.glb`. SHA-256: `6f8b1f229066283144c49163c1b43fe628940db422332442987c3a11bebfa44c`. Original node transforms and vertex/index data remain intact. Only runtime framing, material assignment, lighting and controls differ from the source file. No new jewelry was generated. The product PNG is rendered from this same GLB by `scripts/render-boutique-preview.mjs`.

## Composition and behavior

Compact centered AMES header; left collection title/subtitle/underlined CTA; large real interactive ring staged under cool spotlight lighting; concise editorial copy in the former circles region; centered New Arrivals heading with narrow bordered cards; all five category links at the bottom. Natural gold remains in the jewelry; interface colors are graphite/silver/white. No prices, stock, ratings or certifications are invented.

There is one authentic existing-model arrival, not four duplicated/fabricated products. Its favorite persists on this device only and is labeled accordingly; it does not claim account synchronization. Live catalog items retain the existing account favorite action. Missing or broken live product images remove their card instead of displaying a generic box. Empty categories show concise availability text, not placeholder cards.

The Boutique adapter mounts only the selected ring stage on first visit, retaining the instance across screen switches. The stage uses the existing Three/R3F stack, imported geometry, physical gem materials, a studio environment, drag/zoom, and idle rotation that respects reduced motion. No customer renderer controls are mounted. The prior procedural fallback is removed from the Boutique path.

## Validation and proof

Production build passes. Playwright at 1440x1000 and 390x844 verifies image loads, no visible dropdowns/placeholders, rotation image change, zoom input, favorite toggle, View scroll, category filtering, no horizontal overflow and no page errors. Full-page captures expand the viewport at the same width to expose the nested scroller; hero heights are fixed, preserving proportions.

Evidence: `outputs/boutique-reference-match/` contains the reference, full desktop/mobile, hero, editorial, New Arrivals, categories, checks.json and comparison.html. Local URL: http://127.0.0.1:3097/ then Boutique.

Scope audit: shell/Chat code before BoutiquePanel and all Video code are unchanged from HEAD. Shared engine hook and Chat stone adapter are unchanged. Canonical integrity hashes and selected jewelry source hash match. No backend, Appwrite, navigation, splash or Benchmark 02 edit.
