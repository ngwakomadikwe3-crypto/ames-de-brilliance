# AMES recovery renderer audit

The customer Stone Tray loads the canonical GLBs from `/models/canonical/` through the AMES Engine WebGL viewer. Before this recovery pass the production presentation used the engine's default preview material and the customer surface exposed the engineering widget controls.

The single recovery presentation pass keeps the existing engine, geometry, environment and camera lifecycle. It assigns a customer diamond material after the canonical mesh settles:

- **Asset:** canonical AMES GLB, selected by `stone-001` through `stone-005`.
- **Material:** `MeshPhysicalMaterial`, IOR 2.417, transmission 0.28, flat facet shading, clearcoat, cool neutral tint and environment contribution.
- **Shader:** Three.js physical WebGL shader; no random sparkle or fake particle layer.
- **Environment:** existing AMES studio environment/PMREM owned by the engine viewer.
- **Refraction/Fresnel/TIR:** IOR and transmission are enabled by the physical material; true multi-bounce facet transport and spectral dispersion are not exposed by the packaged viewer API.
- **Fallback:** none in the customer path. Renderer failures are surfaced as diagnostics and an explicit status message.

The screenshots show the UI recovery and canonical cut switching. They also show the remaining launch blocker: the packaged WebGL material still reads as a simplified faceted preview rather than diamond-webgl-level optical transport. This branch therefore remains for owner visual review and must not be deployed or merged until the engine package exposes the approved facet-ray/WebGPU path.
