# AMES authored pieces

Original AMES designs built in code, with real brilliant facets from ames-engine.

- `lib2.mjs` holds the shared builder: cuts, fine claw settings, merged pavé (`ames_pave`) and meshopt output.
- `earring2.mjs` builds the pear-drop earrings.
- `watch2.mjs` builds the iced watch. Its hands are pivot nodes tagged `ames_watch_hand`, which the viewer turns to local time.
- `bracelet2.mjs` builds the tennis bracelet.
- `ames_still.py` makes the Boutique stills with Blender Cycles (`pip install bpy`). It renders the raw (uncompressed) GLB and uses the jewellery tent v2 HDR.

To build:

    npx esbuild eng-entry.ts --bundle --format=esm --external:three --outfile=eng.mjs
    node watch2.mjs watch.glb watch-raw.glb

The second argument writes an uncompressed copy for Blender.
