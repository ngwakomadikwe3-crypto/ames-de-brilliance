# Mobile gemstone rendering

The 29-stone library keeps its hidden, on-demand selection and one active object. Twenty faceted stones use revision 4 geometry and matching transparent posters. Moonstone uses a preserved, higher-dome revision 3 source; the other eight organic/cabochon assets retain revision 2. The opening ring is unchanged.

## Rendering

The gemstone-studio profile uses a bounded convex-facet tracer. It derives outward planes from the actual closed GLB geometry, checks convexity and welded edge closure, deduplicates coplanar triangles, and traces internal intersections/refraction and total internal reflection through those facets. Surface and internal interfaces use Schlick Fresnel, retaining partial internal reflection contributions; illustrative body absorption depends on traced distance normalized to model size. This is a visual model, not a gemological simulation or a certified material measurement.

The shader has no BVH textures, recursion, traversal stacks or offscreen transmission buffer. It supports at most 144 planes. Motion starts with 4 internal bounces on SAFE/LOW or 6 on higher tiers; idle refinement uses up to 6 for smaller cuts and 4 for cuts over 80 planes on SAFE/LOW. A uniform-bounded facet loop limits driver compilation expansion. Hardware fragment-uniform capacity is checked before selecting it. Unsupported volumes use the lightweight environment approximation; they never fall through to the desktop BVH path in gemstone-studio.

Ametrine's two material primitives share a validated complete volume in a matching coordinate frame. Their purple/gold colours remain separate. The opaque/nacre/opal surface materials keep their existing rendering.

Spark-family phones vary substantially. Touch devices with at most 4 GB reported/unknown memory receive the LOW gemstone budget: 2x idle pixel ratio, reduced to 1.5x during explicitly enabled turntable motion, and four initial bounces. Apple touch devices, including desktop-style iPad browser user agents, keep the compatible SAFE profile with the new facet tracer and up to 2x pixel ratio. These budgets do not change ring or CAD quality profiles.

Idle previews render on demand. After 500 ms at rest, a two-sample refinement pass improves internal edge antialiasing. Orbit/turntable motion immediately uses a single sample, with no material recompilation. Smooth camera-ray derivatives control environment mip selection to avoid triangle seams; the loose-gem profile now uses a locally generated smooth softbox cube, avoiding the old window-grid reflections. Fixed-range radiance uses opaque RGBA8 with sRGB decoding before filtering; no float textures or render targets are required. Jewelry retains its separate photographic environment. Orbit/zoom changes and the controlled turntable invalidate frames. Idle frame gaps are excluded from the quality governor. Antialiasing is enabled for gemstones; contact shadows are disabled for this isolated-object presentation.

## Assets and reproducibility

- scripts/blender/refine_mobile_gemstones.py rebuilds the convex cuts from preserved revision 2 Blender scenes, refines brilliant-family girdles to 32 outline segments, adds step tiers with small culets, measures actual pavilion slopes against each material IOR to retain a five-degree critical-angle margin, recalculates outward flat facet normals, verifies manifold edges, and exports GLBs and editable Blender sources.
- Ruby, emerald, sapphire and garnet source material colours match the renderer's representative defaults.
- scripts/blender/render_mobile_gemstone_posters.py renders matching denoised transparent 640px PNGs. PNGs are converted to WebP at quality 94. Original GLBs, Blender scenes and posters are preserved under source-assets/gemstones/revision-2.
- public/ames-engine/gemstone-quality.json records the mixed asset revisions and generators. Source geometry is AMES original; no reference-site images or third-party geometry were copied.
- vendor/ames-engine-0.1.0.tgz contains the complete renderer source; package-lock pins the archive's integrity. vendor/mobile-gemstone-optics.patch provides a readable diff from the prior renderer.

## Verification

Run node --experimental-strip-types --test scripts/test-mobile-gem-optics.mjs scripts/test-gemstone-selection.mjs scripts/test-ames-chat.mjs.

The internal /dev/gemstone-review route is available only with NODE_ENV=development and returns 404 in production. It uses the real application viewer without loading the opening ring or touching chat/customer data. Run python scripts/verify-mobile-gemstones.py http://localhost:3010 ENGINE ruby,emerald,sapphire,diamond,ametrine,opal,pearl,turquoise. Supported ENGINE values: webkit, chromium, tecno-spark, ipad-a16. Requires Python Playwright with WebKit and installed Chrome.

Browser reports and screenshots are under .ames-cad/qa-mobile-gemstones. Checks cover real WebGL ready, single canvas, rendering pixel ratio, context loss, shader/page errors, orbit changes, overflow, and iPad landscape. Browser phone/tablet profiles run on Windows graphics hardware. They do not certify physical Tecno Spark or iPad A16 performance or appearance. An earlier Chromium software-renderer navigation stress run timed out; the native-browser representative checks are recorded separately.

## Photographic lighting and framing

Studio Small 09 by Sergej Majboroda is supplied under CC0: https://polyhaven.com/a/studio_small_09 and https://polyhaven.com/license. The archived HDR and source/license records are under source-assets/environments. scripts/build-mobile-studio-environment.mjs builds six 256px HDR cubes and display WebPs (about 677 KB total) for local hosting. There is no third-party lighting request at runtime. Generated lighting remains the network-failure fallback.

A dedicated gemstone camera uses a 24-degree field of view and a 20-degree polar view. Ring/CAD framing is unchanged. Chat appends contract revisions to gemstone GLB/poster requests so an older cached cut cannot survive a revision change.

The previous mobile3 appearance was rejected by the owner as flat/artificial. Revision 4 is a further visual refinement, not owner approval. Physical Tecno Spark and iPad A16 review remains pending. Automated checks establish asset integrity and interaction, not photorealism. The ray tracer approximates absorption and omits spectral dispersion, inclusions, and measured gemstone data. Commercial/manufacturing approval remains unchanged.

The isolated scripts/verify-mobile-gemstone-chat.py flow uses real assets with mocked chat services, never customer conversations. It checks selection, one active object, rotation, stop, and revision switching.

## Shared object display, studio5

Object stages, catalogue tiles and Media use the same local emerald vignette and soft grounding shadow. These are non-interactive CSS gradients behind objects; no layout, font, navigation or global background changes and no blur/filter pass on live canvases.

The soft-studio profile used for jewellery and private CAD now uses the same photographic HDR lighting, with a controlled key/fill/rim ratio and polished-metal reflection strength. SAFE/LOW jewellery edges use antialiasing and up to 1.5x pixel ratio; idle controlled jewellery renders on demand. Loose gemstone optical geometry and the revision 3 ring GLB are unchanged. Legacy model-viewer jewellery uses the archived 1k HDR through local studio.hdr; other model-viewer consumers retain neutral lighting.

The ring's new presentation-ring-studio.webp is a transparent Cycles render from the exact current GLB (SHA256 5eefe57b5ddb6722c2c728fb6ea7820753fec8c5bebebcdd743c6edfd80dfe41). Boutique, Chat and Media share it; the previous opaque poster is retained. Reproduce with render_photoreal_jewelry.py using AMES_PROJECT_ROOT, AMES_OUTPUT_ROOT, AMES_ASSET=dev-test-candidate-ring, AMES_SHOT=presentation, AMES_TRANSPARENT=1, AMES_SAMPLES=40, AMES_RESOLUTION_SCALE=0.85, AMES_THREADS=3. Encode the resulting RGBA PNG as WebP quality96. This changes presentation, not geometry, stock specifications, manufacturing or approval status.

## November 4 realism refresh

The renderer package adds lower body fill, calibrated representative colors, per-draw matrix uploads, 2x idle resolution and a dedicated moonstone visual approximation. Moonstone uses an analytic dome/cylinder exit proxy, modest internal haze and a moving blue sheen; it does not reproduce microscopic feldspar diffraction. Its new editable source and revision 3 GLB preserve the prior assets.

Reproduce focused browser checks with `python scripts/verify-gem-refresh.py http://127.0.0.1:3033 android focused amethyst,tanzanite,moonstone` and the same command using `iphone`. These are Chrome and WebKit desktop emulations, not physical Android/iOS certification. Reports include pixel-content guards so a ready-but-blank canvas cannot pass. `--posters` captures transparent source images for reviewed fallback revisions.

The original poster set is retained until matching replacement captures are validated. All stones remain educational review assets with visual approval pending. A browser pass establishes loading, resolution and interaction, not photorealism or gemological accuracy.
