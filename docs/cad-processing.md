# Private CAD preview processing

The Dashboard â†’ Jewelry workflow can now queue a source conversion, review components, assign materials, and regenerate a private GLB and transparent PNG. Existing product IDs, trader IDs and source SHA-256 hashes remain the identity chain. New jobs do not change commercial approval or public content.

## Start locally

1. Use the existing authenticated owner dashboard and a working Appwrite configuration.
2. Install Blender 5.2 or set `AMES_BLENDER_PATH` to the Blender executable. No Blender UI scene is changed; the worker launches a separate background process.
3. From the repository root, run `npm run cad:worker`. Keep it running alongside the app.
4. Create/select a Jewelry product. Upload the preferred Rhino / Matrix `.3dm` original plus a companion `.glb` export (OBJ/STL/FBX are alternatives). Select the exported mesh and declared source units, then choose **Generate 3D preview**.
5. Review the model and component names. Select **Review component materials**, confirm the choices and regenerate.
6. Download the private preview/report or use the existing engine handoff manifest. The existing complete content-pack technical review, visual approval and publication workflow still applies.

The UI and API remain owner-only, matching existing jewelry onboarding. This is the staff-assisted onboarding path; it does not introduce jeweller accounts or weaken legacy portal authentication.

## Format choice

AMES prefers `.3dm` as the original jewelry CAD source, `.stl` as a manufacturing interchange fallback, and `.glb` as the visualization format. This is a workflow recommendation, not a measured market-share ranking.

Rhino documents its jewelry ecosystem, including MatrixGold, and STL manufacturing exports: https://www.rhino3d.com/en/for/jewelry/
Gemvision documents RhinoGold 3DM import into MatrixGold: https://gemvision.com/Manuals/RG_vs_MG_2026_Tool_Features_JAN.pdf
Rhino lists native 3DM and GLB export support: https://www.rhino3d.com/features/file-formats/

A 3DM original is stored privately, hashed and included in operator handoff. It is not passed to Blender or advertised as automatically converted. Upload a corresponding GLB/mesh for the current preview pipeline. Matching the exported mesh to the original CAD remains a human review responsibility; no automatic lineage claim is made. Native 3DM tessellation is the next adapter to implement.

## Supported inputs

- OBJ: polygon meshes and named components. Standalone OBJ does not bundle MTL/textures; assign materials after inspection. Curves/surfaces must be tessellated by the CAD author.
- STL: geometry only; no materials or reliable units. Export separate named components as OBJ/GLB when different surfaces need different materials.
- GLB 2: embedded geometry/materials/textures; external resources are rejected.
- FBX: mesh import with embedded textures. External texture references fail with an export-to-GLB instruction.
- Native Rhino/Matrix `.3dm` is accepted as an original source for private storage/handoff. STEP is not accepted. Neither native 3DM nor ZIP is automatically converted. Export a mesh from CAD; the existing ZIP/operator handoff remains available.

Limits: 100 MB per automatic conversion, 500 mesh components, 2 million triangles, one worker, one pending job per product, five-minute conversion timeout. Output is fitted for display. Original source bytes are retained and hashed. Declared units do not certify scale, dimensions, stone identity, purity, carat, or manufacturability. No missing gemstones are generated. Source material preservation retains supplied data; it is not an approval of its accuracy.

## Storage, review and failures

In local mode, the app and worker must share the same private CAD root (default ignored `.ames-cad/`, or `AMES_CAD_ROOT`). The hosted adapter instead calls the authenticated broker; the broker and worker share a durable private volume. See `deploy/cad/README.md`. Files live in ignored `.ames-cad/`, never `public/`. Preview endpoints check the owner session, product/source binding, ready status and output hashes. A separate material revision creates a new immutable job instead of overwriting an earlier preview. The handoff manifest carries private preview links, choices and source identity. Conversion reports and previews remain outside the published indexes.

Queued jobs survive app restarts. On worker restart, interrupted processing jobs become failed so they can be retried. The worker uses an exclusive lock; after a crash, inspect the PID in `.ames-cad/worker.lock` and only remove that exact lock once the worker has exited. Windows/OneDrive rename locks are retried. A failed job never exposes partial output. Local source/job retention is manual; back up or remove old jobs under an explicit retention policy.

This local worker is not an internet-scale service and is not suitable for a serverless writable filesystem. Before deployment, place conversions in isolated workers with CPU/memory/filesystem/network limits, move the queue and artifacts to durable private storage, add retention and monitoring, and implement authenticated per-jeweller access. Blender importers parse untrusted complex files; `--disable-autoexec` alone is not a security sandbox. Nothing in this change deploys a worker or changes Appwrite credentials.

## Verification

`npm run test:cad` checks queue identity, material validation, duplicate jobs, source checksums, external GLB resources and reviewed-product locks. `node scripts/test-cad-blender.mjs` runs two real conversions of the repository earring in an isolated ignored test directory: neutral import, then declared platinum material. These are test artifacts, not changed product assets or approved descriptions.

## Historical verification limits (superseded where noted below)

The queue tests and existing onboarding/Chat/Boutique/Media tests passed. TypeScript and focused lint passed during implementation. Two actual Blender GLB conversions of the earring passed, including a neutral-to-platinum material revision and transparent PNG output.

Final production build and browser verification were blocked by OneDrive dependency read failures (cloud operation unsuccessful / UNKNOWN read in a Next.js worker). An OBJ format smoke test hit the conversion timeout; separate OBJ/STL/FBX verification remains outstanding. Do not treat these checks as passed. Appwrite credentials also need restoration before testing a real cloud upload. The UI remains staff-assisted; native CAD adapters and secure jeweller self-service are not implemented here.

## Representative-ring verification — 25 October 2026

The current production build and TypeScript check passed locally. `scripts/test-cad-formats.mjs` now completed real OBJ/STL/FBX cube-fixture conversions to GLB and PNG in Windows Blender 5.2.1. `scripts/test-cad-ring.mjs` converted the supplied representative ring, preserving the input hash and reporting 50 components / 158,518 triangles. Outputs stay under ignored `.ames-cad/tests/`; no test product was approved or published.

These trusted local-fixture conversions do not establish security for arbitrary uploaded files. Docker is unavailable here; the Linux container, TLS broker, durable hosting, backup restore and authenticated Appwrite-upload-to-publication flow remain unverified. No native 3DM/STEP converter was added. The local Appwrite key was previously found expired and was not replaced or copied during this work.

See `docs/representative-ring-audit.md` for browser evidence, review boundaries and remaining requirements. Existing operator-pack imports still require a complete reviewed engine pack; a raw Blender GLB/PNG conversion does not automatically become a published product.
