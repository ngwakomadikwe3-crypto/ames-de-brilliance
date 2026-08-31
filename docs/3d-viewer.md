# 3D Viewer

The jewelry renderer is a small React Three Fiber abstraction in `src/components/jewelry/JewelryViewer.tsx`. It owns GLB loading, framing, controls, studio lighting, material application, visibility pausing, reduced-motion behavior, fallbacks, and disposal. Product data remains separate in `src/data/products.ts`; the carousel decides which product is active.

## Add a GLB

1. Export the jeweler CAD model as a web-ready `.glb`.
2. Place it under `public/models/`.
3. Add a product entry with `kind: "glb"` and `modelUrl: "/models/your-piece.glb"`.
4. Optionally provide `thumbnailUrl` for the no-WebGL fallback.

Production assets come from jeweler CAD converted to GLB. The current demo stone is a clearly marked placeholder and must be replaced before production.

## Add a product

Use the product shape:

```ts
{
  id, name, category, kind, modelUrl, thumbnailUrl,
  defaultMetal, supportedMetals, defaultDiamond, supportedDiamonds
}
```

The existing folder-scan/catalog adapter may retain legacy fields for Hintspo and Jewelshop entries. Configurator interfaces are defined in `jewelryTypes.ts`; they are data contracts only, not UI.

## Environments

The viewer currently uses a procedural `studio` environment with `RoomEnvironment` and `PMREMGenerator`. Change `jewelryViewerConfig.environment` when additional environment implementations are added. `daylight`, `evening`, and `dark` are reserved keys.

## Add metals

Add a canonical metal preset and aliases in `jewelryMaterials.ts`. Extend `materialMap` with the exact names exported by the GLB, then include the canonical name in a product’s `supportedMetals`. `setMetal` only mutates mapped materials; it never changes unrelated meshes.

## Add diamond variants

Add a gemstone data entry and map its GLB material name. Diamond uses `MeshPhysicalMaterial` with transmission, IOR, thickness, zero roughness, zero metalness, and flat shading. Sapphire, ruby, and emerald entries are ready as data extensions.

## Mobile testing

Run the development server, open the app on a device or mobile emulation, rotate and zoom the piece, switch products repeatedly, background the tab, and enable reduced motion. Check that the static image appears when WebGL is unavailable and that controls remain keyboard operable.

## Limitations

The viewer cannot recover missing or malformed GLB geometry. Material selectors appear only for variants exposed by the loaded asset. Placeholder imagery and the demo GLB are not production jewelry. Very dense CAD exports may require optimization, texture compression, and mesh simplification.

## Commands

```bash
npm run dev
npm run build
```

QA should confirm there are no viewer iframes, disposal runs during repeated switches, WebGL/static fallbacks render safely, existing AMES surfaces remain unchanged, and the production build is green.
