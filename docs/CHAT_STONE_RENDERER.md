# Chat stone rendering audit

Scope: CENTER Chat renderer only, branch recovery/ames-visual. No deployment or merge.

## Exact original path
ChatPanel -> AmesStoneTraySurface -> useEngineSurface -> integration.mountStoneTray -> packaged AMES WebGL viewer -> createAMESDiamondMaterial.

| Item | Before recovery |
| --- | --- |
| Asset | stone-001: /models/canonical/ames_round_brilliant_v1.glb, 30,964 bytes; remaining cuts selected through the same canonical manifest |
| Active shader | MeshPhysicalMaterial; transmission 0.28, blue-grey color, blue emissive fill, flat shading, double-sided, IOR 2.417 |
| Environment | Packaged StudioEnvironment: procedural room with five white rectangular lights, PMREM cube-UV |
| Refraction | Approximate physical-material screen-space transmission: yes; internal facet refraction: no |
| Fresnel | Surface Fresnel: yes |
| TIR | Internal facet TIR: no |
| Internal bounces | No |
| Dispersion | Physical-material dispersion 0.18; approximate transmission sampling only |
| Tone mapping | ACES Filmic, exposure 1 |
| Color space | Linear working space; sRGB output |
| Anti-aliasing | WebGL context antialias=true, INTERACTIVE pixel ratio 1 |
| Fallback | No alternate asset. The opaque material was the normal path, not a GLB-load failure |

## Production path

One ShaderMaterial, AMES Chat Facet Transport, on the existing AMES viewer. The same shader serves all five canonical cuts. No extra library, alternate diamond shader, generated stone or geometry replacement.

- Reads loaded triangle positions and extracts the convex support planes. Coplanar triangles are grouped within floating-point tolerance. Vertex/index buffers are not changed. Unsupported/non-convex input is rejected rather than silently approximated.
- Air/diamond Snell refraction and exact unpolarized Fresnel reflection.
- Up to 12 internal facet hits. Each refracted exit contributes environment light; the reflected branch continues. TIR retains all remaining reflected energy.
- Central transport IOR 2.417. Restrained RGB exit refraction uses 2.414 / 2.417 / 2.422. This shared-path dispersion is a deliberate real-time approximation, not a full spectral path tracer. Channels near a TIR boundary share the central exit direction to prevent colored breakup.
- Existing studio PMREM contributes all illumination. No emissive fill or opaque diffuse base. Environment directions are transformed into world space every draw, so the environment does not rotate with the stone.
- Small angular PMREM filtering, ACES tone mapping and explicit sRGB output conversion. No random samples, accumulation noise, temporal trails or debug overlays.
- Convex girdle acceleration: segments fully inside its inscribed cylinder skip the girdle group. Remaining tests still use the original extracted facet planes. This does not change the surface.
- Camera starts near the table for a readable cut; existing drag/pinch/scroll controls remain. Idle rotation is 0.10 radians/second and respects reduced motion.
- Existing colored-gem preview commands remain available. They are not a fallback for diamond rendering.
- Per-draw matrix/camera updates are removed when the material is disposed. Material uniforms are owned by the material; no additional render target or texture allocation.

## Verification

- Five numerical tests compare 100 interior rays per cut against the actual triangle mesh, also comparing the girdle acceleration to the full plane search. Vertex/index buffers remain byte-identical.
- Production build and TypeScript pass. Full app suite: 28 tests pass.
- All five canonical GLB SHA-256 hashes match public/models/canonical/integrity.json.
- Browser shader compilation and page-error checks pass. No selectors/developer overlays are visible in Chat.
- Screenshots are actual Chromium captures of the production app at http://127.0.0.1:3093, not generated mockups.
- Hardware measurements use ANGLE / Intel UHD Graphics / D3D11, with antialiasing enabled. Frame time comes from consecutive stone draw submissions during scripted drag. GPU cost uses EXT_disjoint_timer_query_webgl2 around the stone draw, discarding disjoint results. CPU submission time is not substituted for GPU cost.
- Phone-width evidence is a 390 x 844 browser viewport on that GPU, not a physical-phone certification. Desktop is 1440 x 900. Neither setup proves every device will meet 45 FPS.

## Sources

[Three.js color management](https://threejs.org/manual/en/color-management.html) specifies explicit output conversion for ShaderMaterial. Installed renderer source confirms the existing ACES/sRGB/PMREM setup.

## Final local results

| Cut / viewport | FPS | Average frame ms | P95 frame ms | Average GPU ms |
| --- | ---: | ---: | ---: | ---: |
| Round / 390px | 60.0 | 16.66 | 17.20 | 6.21 |
| Round / 1440px | 59.6 | 16.77 | 17.70 | 7.19 |
| Oval / 390px | 59.4 | 16.83 | 17.70 | 5.26 |
| Emerald / 390px | 59.8 | 16.72 | 17.80 | 4.65 |
| Pear / 390px | 59.0 | 16.95 | 17.60 | 5.25 |
| Asscher / 390px | 59.8 | 16.71 | 17.60 | 4.14 |

All measured final hardware runs exceed the 45 FPS average floor; P95 frame times are below 22.22 ms. The target is approximately 60 FPS, not a guarantee for arbitrary hardware. Software rasterization is not accepted as an interactive production-performance result.

Inspected captures: Round front/rotated, Oval front/rotated, Emerald/Pear/Asscher front/rotated, phone-width Chat and desktop Chat. These show actual internal reflections and refraction rather than the previous opaque grey surface. Owner visual acceptance remains required; this is not a claim of full spectral photorealism.

Evidence folder: outputs/stone-rendering. Requested files: round-front.png, round-rotated.png, oval-front.png, oval-rotated.png, mobile-chat.png, desktop-chat.png. Per-cut *-hardware-report.json files include GPU identity, timing samples, errors and canonical hashes.

Reproduce against the local production app with `node scripts/verify-stone-rendering.mjs round --hardware`, then oval, emerald, pear and asscher in that order. Screenshot automation reuses the already installed Playwright from the engine workspace. Instrumentation is injected by the test runner only, never shipped in Chat.

Verdict: READY_FOR_OWNER_REVIEW. No deployment, main merge or change to the protected surfaces/data/geometry.

