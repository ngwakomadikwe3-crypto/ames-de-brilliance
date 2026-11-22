# The eight custom-order designs

Codes: **W1** Classic Pavé watch · **W2** Square Boutique watch · **B1** Tennis Line bracelet · **B2** Pavé Bangle ·
**N1** Rivière Drop necklace · **N2** Solitaire Pendant · **E1** Cascade Drop earrings · **E2** Convertible Stud earrings.
Data: `src/lib/custom-designs.ts` (`images: { front, back }`, options feeding the quote, earring wear states).
Pages: Boutique grid card (front view), detail and configuration (Front/Back gallery, front view beside the options),
try-on entry, made-to-order quote; shareable at `/designs/<code>`.

## Imagery

Save each render unchanged as a PNG in `public/atelier/designs/<CODE>/`, then run `npm run designs:images`.
The script writes AVIF and WebP copies (same pixels, smaller widths only, never upscaled) and updates
`src/lib/custom-design-images.json`. Never crop, recolour, filter or put text on a render.

| Code | Front | Back | Stud-alone front |
|---|---|---|---|
| W1 | `W1-classic-pave-watch-front.png` | `W1-classic-pave-watch-back.png` | |
| W2 | `W2-square-boutique-watch-front.png` | `W2-square-boutique-watch-back.png` | |
| B1 | `B1-tennis-line-bracelet-front.png` | `B1-tennis-line-bracelet-back.png` | |
| B2 | `B2-pave-bangle-front.png` | `B2-pave-bangle-back.png` | |
| N1 | `N1-riviere-drop-necklace-front.png` | `N1-riviere-drop-necklace-back.png` | |
| N2 | `N2-solitaire-pendant-front.png` | `N2-solitaire-pendant-back.png` | |
| E1 | `E1-cascade-drop-earrings-front.png` | `E1-cascade-drop-earrings-back.png` | `E1-cascade-drop-earrings-stud-front.png` |
| E2 | `E2-convertible-stud-front.png` | `E2-convertible-stud-back.png` | `E2-convertible-stud-stud-front.png` |

A missing render shows as a plain "on its way" panel and is listed on the design page; nothing stands in for it.

## 3D models

All eight designs have a live 3D model in `public/atelier/designs/<CODE>/`, built in Blender (bpy module) by a
script in `scripts/blender/` and compressed with `gltf-transform meshopt`:

| Code | Model | Script |
|---|---|---|
| W1 | `W1-classic-pave-watch.glb` | `create_w1_classic_pave.py` |
| W2 | `W2-square-boutique-watch.glb` | `create_w2_square_boutique.py` |
| B1 | `B1-tennis-line.glb` | `create_tennis_bracelet_v4.py` (house tennis bracelet), then `scripts/accent-nodes.mjs` (every 4th stone) |
| B2 | `B2-pave-bangle.glb` | `create_b2_pave_bangle.py` |
| N1 | `N1-riviere-drop.glb` | `create_n1_riviere_drop.py`, then `scripts/accent-nodes.mjs` (every 3rd stone) |
| N2 | `N2-solitaire-pendant.glb` | `create_n2_solitaire_pendant.py` |
| E1 | `E1-cascade-drop.glb` | `create_e1_cascade_drop.py` |
| E2 | `E2-convertible-stud.glb` | `create_e2_convertible_stud.py` |

Each model is the default configuration (first choice of every option). Stones a collection's accent choice
recolours carry "Accent" in their node name (never on metal). Watches put their crystal on `ames_glass:
'over-stones'`, a clear non-transmissive crystal (engine patch in `scripts/prepare-view-gestures.mjs`), because a
transmissive crystal hides the transmissive pave dial beneath it.

The detail view opens the 3D viewer at the front angle with the front render as its poster, pulls the camera back
on narrow (portrait) stages so the whole piece stays in frame, and falls back to the renders if the model fails to
load or the device cannot run WebGL.

**Convertible earrings (E1, E2) are separate meshes, never one fused piece.** Each earring of the pair has:
- `E1_stud_<side>` / `E2_stud_<side>`: the stud (stone, claws, post), with `E1_lock_<side>` (a closed loop hidden
  behind the gallery) or `E2_lock_<side>` (a collar on the post) that the detachable part locks onto, and
- `E1_drop_<side>` / `E2_jacket_<side>`: the detachable cascade (hinged, it swings) or halo jacket.

`applyWearState(root, design, 'stud' | 'full')` hides or shows every node named `E1_drop` / `E2_jacket` or
starting with it plus `_`. In the 3D stage the same rule runs inside the engine: the page sends `ames:hide`
`{names}` to the viewer canvas when the "Wear as" toggle changes. The try-on uses it too (Fitting Registry earrings
entry, states `stud` and `full`) once the portrait twin is ready.
