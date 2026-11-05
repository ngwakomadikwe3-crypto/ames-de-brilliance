# AMES DE BRILLIANTE — visual standard and reusable 3D asset system

The source of truth is `standards/ames-visual-standard.v1.json`. The product contract is `src/lib/ames-asset-standard.ts`. This system produces and checks **usable interactive GLBs and matching studio evidence**. Concept images, product renders and animation are separate deliverable types. A beautiful image does not establish a usable 3D model.

## Visual direction

Editorial luxury means sculptural form, restrained composition, precise detail and controlled reflections. Present the object with generous space. Use warm ivory, soft champagne, deep charcoal or rich black for exported studio imagery. Interactive objects retain the existing AMES emerald interface, typography and navigation; a transparent stage prevents a second rectangular background appearing around the piece.

Inspection views keep the whole item readable, with sufficient depth of field and no clipped attachments. Macro and shallow editorial focus are additional views, never replacements for front, three-quarter, side, back and underside evidence. Avoid bloom, permanent glitter, emissive gemstones and highlights that erase metal edges or the diamond table. Dark facets are part of a believable moving reflection pattern; neither an entirely white centre nor uniform black extinction passes visual review.

## Product inputs and unknowns

Create a versioned brief before producing a model. Record product name/category, design and references, dimensions in millimetres, scale evidence, metal and finish, main gemstone species/shape/cut/dimensions/colour appearance, additional stone quantities/sizes/arrangement, setting/construction, deliverable, renderer, views, background and device budget. Record unknowns and every assumption. A reference photo is not dimensional evidence.

Every rendered mesh node has an exact name, stable component ID, material role, surface type, material intent and reference IDs. Use `preserve-source` when the original materials should remain intact, including gemstone species outside the starter presets. Never recolour all parts of a mixed metal/gem mesh or infer gemstones solely from names. Separate physically different components before assigning materials.

Use `surface: faceted` for a cut stone with sharp facet boundaries; `polished-curved` for cabochons, pearls and continuous metal; `textured` for supplied surface detail. Starter colours are explicit artistic approximations. Preserve measured/source colours or enter the reference-matched colour; these are not grade or alloy-purity measurements.

## Materials and optics

| Material | Required visual behaviour | Unacceptable shortcut |
| --- | --- | --- |
| Diamond | Coherent table/crown/girdle/pavilion/culet, flat facet normals, depth, angle-dependent reflection and internal refraction | Smooth transparent placeholder, chrome shader, white core, glitter overlay |
| Coloured faceted gemstone | Species-appropriate optical starting point, reference-matched body colour, convincing facets and depth | Recoloured diamond shader presented as physically identical material |
| Cabochon | Polished curvature, appropriate translucency and body colour | Facets or added phenomena unsupported by the reference |
| Pearl | Soft, layered lustre and restrained surface character | Plastic gloss or invented nacre quality |
| Opal | Reference-matched body and angle-dependent play-of-colour when supported | Static rainbow texture presented as diffraction |
| Metal | Distinct plausible gold/platinum/silver response, controlled reflections, actual finish detail | Plastic diffuse material, exaggerated orange gold, relief represented only by roughness |

The browser's existing qualified closed-facet tracer approximates internal refraction and total internal reflection. The kit's Cycles path uses an RGB dielectric. **Neither this kit nor its default browser presets implement spectral dispersion, birefringence, pleochroism or physical opal diffraction.** Pearl layering is approximate. The capability matrix records these limits, and requested unsupported effects appear in reports. Do not enable false rainbow “fire” to hide the limitation. A spectral/specialist renderer would need a separately documented implementation and validation.

IORs are representative material-family starting values, not measurements of the supplied stone. Coloured-stone Cycles presets have distinct, explicitly artistic RGB volume-absorption starting densities as well as different IOR/roughness; they require reference matching and are not measured spectra. Volume appearance and its export support must be checked in the target browser. GIA reference properties inform [diamond](https://www.gia.edu/diamond), [ruby](https://www.gia.edu/ruby), [sapphire](https://www.gia.edu/sapphire), [emerald](https://www.gia.edu/emerald), [amethyst/quartz](https://www.gia.edu/amethyst), [pearl](https://www.gia.edu/pearl) and [opal](https://www.gia.edu/opal). Keep reference provenance in the brief; do not infer origin, treatment, rarity, certification, clarity or carat weight from rendering.

Polished and satin materials have reusable starts. Brushed, hammered and engraved surfaces require supplied directional texture, normal/depth maps or actual source geometry. The Blender kit rejects a request to manufacture these finishes by setting roughness alone. No wear or inclusions are added automatically.

## Construction checks by category

| Category | Required human inspection |
| --- | --- |
| Loose stones | Silhouette, coherent cut, proportions, girdle/culet, closure, normals and appropriate optical behaviour |
| Rings | Shank profile/thickness, ring dimensions, seats, contact at claws/prongs/bezel, gallery, pavé spacing and underside |
| Earrings | Whether one or a pair was supplied, posts/hooks, backs, hinges, stone seats and clearance |
| Necklaces and chains | Link connectivity and articulation, clasp/hinge construction, bail attachments, stone seats and full length |
| Pendants | Bail and attachments, gallery/back, stone support, chain only when supplied |
| Bracelets | Link and hinge articulation, clasp security, clearances, stone support and fit dimensions |
| Brooches | Pin, hinge, catch, attachment strength and front/back support |
| Collections | Consistent material identity/scale/lighting and component provenance without silently duplicating a physical product |

Check every stone's seating, component intersections and clearance in all relevant views. Numerical mesh checks do not prove physical connections or safe dimensions. A qualified jeweller must review construction using the supplied dimensions and material/process requirements. No universal minimum thickness is invented and no manufacturing certification is issued by this system.

## Produce and inspect an asset

1. Create a brief: `node --experimental-strip-types scripts/asset-system.mjs init my-piece NEW-brief.json`.
2. Fill the brief and run `node --experimental-strip-types scripts/asset-system.mjs check NEW-brief.json`. Missing inputs block production readiness.
3. Prepare a **trusted** Blender scene in metre geometry (`METRIC`, `scale_length=1`). Preserve parent/world transforms and sensible object pivots. Record every mesh. Use clean topology, separate named materials and flat normals on faceted stones. Do not open untrusted `.blend` files through this helper; use the existing isolated upload/conversion worker for external sources.
4. Run Blender with `--background trusted-source.blend --python-exit-code 1 --python scripts/blender/ames_asset_kit.py -- NEW-brief.json NEW_OUTPUT_DIRECTORY`. The output directory must not exist. The kit does not overwrite an existing asset pack. Geometry is preserved; no missing prongs, stones or clasps are invented.
5. The kit exports `model.glb`, source and studio `.blend` files, a delivery brief, six PNG inspection views and a checksum/provenance manifest. Blender XYZ dimensions are remapped to glTF XYZ (source XZY); the delivery brief records the exported axes. glTF uses metres, as specified by [Khronos](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html).
6. Audit the actual output: `node --experimental-strip-types scripts/asset-system.mjs check OUTPUT/brief.json OUTPUT/model.glb NEW-report.json`. Exit 2 means missing inputs or technical blockers; exit 1 means invalid input/tool failure. Neither result may be relabelled a completed asset.
7. In **Dashboard → 3D asset standard**, open the brief and GLB locally, inspect the model, compare studio backdrops, orbit/zoom and download a report. Local workbench files are not uploaded. Back and underside use manual orbit because the existing renderer does not expose named camera presets for them; the Blender kit supplies repeatable views.
8. Complete named human visual/construction/device reviews with evidence. Bind them to the model SHA-256. A changed model invalidates that binding. `human-signoff-recorded` records those declarations; it does not bypass the existing staff product, rights, commercial and publication workflow.

The workbench report covers the selected model, not automatic acceptance of every render in a package. The build manifest hashes the standard, lighting source and each exported view. Reviewers must identify the actual view evidence; lighting or image changes need fresh visual review. The existing content-pack publication workflow remains responsible for locking and approving the entire delivered pack.

The audit is a bounded inspection subset, not the complete Khronos glTF Validator. It checks embedded uncompressed geometry, finite positions, index/accessor bounds, unit normals, mesh names, closed oriented edges and signed volume, connected shells, metre-based bounds including assembly transforms, material families, image dimensions and budgets. It rejects external/data-URI dependencies, skins, morph targets and compressed inspection accessors. Deliver compression only after comparing a validated inspection source and validating the compressed result with the target renderer. It does not certify convexity, intersections, physical facet accuracy, texture authenticity or optical output.

## Device budgets and LOD

| Tier | GLB | Triangles | Primitives | Texture edge | Target pixel ratio |
| --- | --- | --- | --- | --- | --- |
| Mobile safe | 5 MiB | 80,000 | 50 | 1,024 px | up to 1.5 |
| Desktop inspection | 12 MiB | 200,000 | 100 | 2,048 px | up to 2 |

These are AMES acceptance targets, not claims about physical device performance. Build separate, named delivery LODs when needed; do not collapse gem facets, prong contacts, thin attachments or chain connections to meet a polygon count. The kit does not silently decimate. Keep the editable source and SHA-256 lineage for every LOD. Test actual Tecno Spark and iPad A16 hardware for aliasing, readability, interaction, memory, thermal limits and recovery.

One selected object/canvas, on-demand loading and poster/error recovery remain the existing app behaviour. Shared engine viewers now respect reduced-motion preferences even when a turntable is requested. Interaction stays quiet; no new customer layout, font or navigation is introduced.

## Calibration and current assets

`scripts/verify-asset-kit.mjs` builds a **non-commercial calibration study** from the existing educational diamond. Its chosen 6.5 mm width is explicitly a pipeline design input, not a stock measurement or grade. This proves real editable source, GLB and matching view generation; a poster alone cannot pass. Output remains under private local QA storage, outside customer inventory.

The existing ring and 29 gemstones are not automatically remodelled, physically qualified or approved by adoption of this standard. Their unknown dimensions and outstanding physical-device/visual reviews remain explicit. Apply the same brief, audit and human review to each supplied product revision before commercial acceptance.
