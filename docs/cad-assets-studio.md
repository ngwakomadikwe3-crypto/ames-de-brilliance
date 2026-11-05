# Local CAD Assets

Open `http://localhost:3010/dashboard/cad` and sign in with the existing owner account. The owner dashboard also links to **CAD Assets**. The existing configured emergency owner code remains available if the Appwrite database is offline. No owner credential is created by this workflow.

Run the web app and conversion worker in separate terminals from the project directory:

```powershell
npm run dev -- --port 3010
npm run cad:worker
```

The worker uses the existing installed Blender (or `AMES_BLENDER_PATH`). It must be running before uploads are accepted. Keep this local development workflow for trusted designs; the separate Linux container deployment is required for hosted untrusted conversion.

## Upload to reusable asset

1. Give the asset a name, select a category (including Accessories), and declare source units if known.
2. Upload one embedded GLB, OBJ, STL, or FBX, up to 100 MB. Native Rhino/Matrix `.3dm` and STEP require a companion mesh export.
3. The source is hashed and retained in the private `.ames-cad/jobs` queue. Progress moves from queued to processing, then ready or failed. The workflow does not depend on Appwrite or a trader record.
4. Inspect the interactive jewellery preview. Download the GLB, transparent PNG, report, or complete review ZIP.
5. The ZIP contains matching AMES Chat, Boutique, Media and asset contracts, provenance, geometry/material metadata, and checksums. All assets remain under review. Originals are retained privately on the workstation, not copied into the website or included in the ZIP.

The pack is a review artifact, not automatic inventory publication. Browser validation, physical scale, material identity, technical acceptance and commercial visual approval are not inferred from a successful conversion. For the existing staff onboarding workflow, extract under the asset ID and retain the downloaded ZIP as `delivery.zip` alongside the manifest. Its quality report deliberately leaves final technical evidence incomplete.

## Cloud later

Local studio routes return an explicit unavailable response on Vercel; they never create jobs on ephemeral deployment storage or expose this computer. The production site only publishes the Accessories category and studio UI at this stage.

The durable queue, converter, artifact checksums, review contracts and ZIP exporter are independent of the studio HTTP routes. Move the worker/controller to the dedicated Linux host described in [the hosting guide](../deploy/cad/README.md), with a durable encrypted volume and the per-job restricted Blender container. The existing cloud product-upload workflow already uses private Appwrite storage and the authenticated HTTPS CAD broker.

Before exposing this standalone studio on the live site, connect its uploads through private durable storage, add authenticated broker operations for listing its jobs and exporting review packs, and preserve the current owner/origin checks and job scope. Set the existing hosted CAD configuration only after those operations pass end-to-end acceptance. Do not point a public tunnel at this local worker.

## Validation

```powershell
npm run test:cad:studio
npm run test:cad
npm run build
```

The local browser check uploads a trusted ring fixture through the actual form, waits for Blender, verifies interactive rendering and the downloaded pack, and checks authentication, cross-origin rejection and mobile layout. QA jobs and screenshots stay in ignored `.ames-cad` storage.
