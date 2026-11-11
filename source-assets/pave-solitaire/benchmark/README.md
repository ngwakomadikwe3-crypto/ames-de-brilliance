# Ring appearance benchmark

This is a review reference, not an approved Boutique replacement.

The existing `solitaire-v3.glb` is rendered in Blender Cycles with the original geometry, a neutral floor, three rectangular area lights and a neutral world. No sparkle sprites, emissive dots or ray-specific lighting rooms are used. The diamond material uses IOR 2.417; the metal is a visual platinum-tone material, not a purity claim.

All 25 gemstone meshes passed a closed-edge manifold check after positional welding for inspection. This check does not certify cut quality, optical performance or manufacturing readiness.

Reproduce from the app root:

```sh
blender -b -t 4 --python scripts/blender/render_ring_benchmark.py -- 384 720
```

Files:
- `ring-reference.png`: higher-angle reference for reviewing the centre stone.
- `ring-reference-side.png`: initial lower-angle study of the band and setting.
- `ring-studio.blend`: generated locally by the script; the editable binary is not included in the public repository.
- `inspection.json`: source checksum and gemstone inspection.

The Blender materials are a reference for subsequent interactive-renderer calibration. They are not automatically transferred into the app. Visual approval and real-device WebGL comparison remain outstanding.
