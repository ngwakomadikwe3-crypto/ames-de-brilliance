# Jewellery asset acceptance checklist

Each asset requires recorded technical evidence and a named human visual/commercial approval. A preview or passed build is not approval. Keep originals private and retain source hashes, units, product ID, geometry revision, render provenance and licence evidence.

| Check | Ring | Earrings | Pendant |
| --- | --- | --- | --- |
| Identity and rights | Match supplied design, source hash and revision | Verify whether listing is one earring or a pair; do not invent a mirrored partner | Identify pendant alone versus supplied chain; do not invent missing pieces |
| Units and proportions | Jeweller verifies ring size, shank, setting and stone dimensions | Verify overall dimensions, matching components and mounting | Verify bail, thickness and any supplied chain dimensions |
| Geometry | Inspect prongs, shank, setting intersections and facets | Inspect posts/hooks, clasp, links and stone mounts | Inspect bail, attachments, front/back and stone mounts |
| Technical mesh | Finite positions, valid indices, normals, winding, cracks and degenerate triangles; inspect silhouette before decimating | Same; test thin parts and overlapping links | Same; test thin bail and back faces |
| Materials | Separate metal from each identifiable gemstone; preserve source intent; verify alloy separately | Yellow gold is the current intended preview, not verified purity; never apply metal blindly to gemstones | Assign only identifiable materials; grey/clay placeholders stay out of customer displays |
| Optics | Closed gemstone geometry and facet normals need review; open melee cannot substantiate volumetric refraction | Same; avoid treating a merged component as one material | Same; do not add missing stones or certify carat visually |
| Framing | Default, side and setting views must fit without clipping; poster/live camera must agree | Include full drop/hook and paired layout only when supplied | Include full bail; close-ups must not hide missing geometry |
| Mobile delivery | Record GLB and image bytes, active canvases, readiness, JS heap and scheduling; GPU/native memory needs device tools | Same; inspect many-component draw cost | Same; check thin-detail aliasing at SAFE quality |
| Failure behaviour | Block GLB, block poster, lose context, retry, switch assets and resize | Same, including legacy ModelViewer fallback | Same |
| Surface consistency | Chat, Boutique and Media must identify the same geometry revision; archived motion must not silently substitute older geometry | Same; no unfinished white render in customer Media | Same |
| Approval | Record technical pass, visual review, verified commercial data and content-pack publication separately | Same | Same |

## Representative-ring status

The current ring's structural checks, same-revision presentation and browser recovery are documented in `representative-ring-audit.md`. Physical scale, manufacturing suitability, verified stone/metal specifications, original licensing evidence and jeweller visual approval remain open. The current center/metal reflections are approximations, not a certified optical simulation.

## Release acceptance

- Inspect real iPhone Safari and Android hardware, including low memory, thermal throttling, orientation, background/foreground and interrupted downloads.
- Verify authenticated source upload through Appwrite, isolated conversion, material review and final content-pack handoff on the intended Linux host.
- Prove source retention, private access, timeout handling, backup restore and monitoring before enabling customer CAD uploads.
- Record reviewed render settings and hashes; re-review after geometry/material changes. Existing archived images are not evidence for a newer geometry revision.
