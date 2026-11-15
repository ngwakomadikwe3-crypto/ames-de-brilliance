# AMES photo studio

Renders the jewellery and gemstones the app shows as studio spins
(`public/ames-engine/<asset>/spin/`).

- `ames_cuts.py` – real cut geometry: GIA-proportion round brilliant (58 facets),
  oval / pear / marquise / cushion outlines, and a step (emerald) cut.
- `ames_studio.py` – lighting rig, per-gem dispersion material, bruted girdle,
  dark stage floor, observer disc, turntable and GPU switch.
- `ames_cabs.py` – cabochons and pearls (amber, jade, lapis, moonstone, opal,
  pearl, rose quartz, sunstone, turquoise).
- `ames_metal.py`, `ames_restone.py` – jeweller's metals; swap placeholder
  stones for real cuts in place.
- `build_piece.py <ring|earrings|bracelet|necklace>` – one review still, or a
  turntable with `FRAMES=72`.
- `gems.py [stone-id ...]` – one still per gemstone, or turntables with `FRAMES=36`.
- `run.sh` – full turntable run on a rented NVIDIA GPU box (needs `pieces/`).
- `pack_spins.py` – PNG frames to the app's WebP spin folders.

The piece meshes (`pieces/*.blend|glb`) are in the render kit, not the repo.

## Real stones in the live 3D files

`restone-glb.mjs` swaps the placeholder stone geometry inside a jewellery or
gemstone GLB for real cuts, leaving nodes, names, materials and the metal
untouched so the live 3D engine (turn, unclasp, measure) works as before.
Run `python3 dump_templates.py` first to write `cut-templates.json`, then e.g.

    node restone-glb.mjs in.glb out.glb 'Tennis diamond=round'
    node restone-glb.mjs stone-ruby/web/jewelry.glb out.glb '@gem=stone-ruby'

Needs `@gltf-transform/core`, `@gltf-transform/extensions` and `meshoptimizer`.

## Smooth stones (cabochons)

`cab_textures.py` paints each smooth stone's real surface into textures (jade
mottling, lapis pyrite and calcite, turquoise matrix web, opal play-of-colour,
sunstone copper glitter, amber flow, rose quartz cloud). `cabs-glb.mjs` maps them
onto the stone's GLB with top-down UVs, and `compress.mjs` re-applies meshopt
compression so files stay close to their original size.

    python3 cab_textures.py                      # writes ./tex
    node cabs-glb.mjs in.glb out.glb stone-opal ./tex
    node compress.mjs out.glb=final.glb
