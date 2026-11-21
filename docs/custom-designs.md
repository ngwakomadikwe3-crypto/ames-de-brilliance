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

Until a design's GLB exists the renders are the design. When `glb` is set, the detail view opens the 3D viewer
at the front angle with the front render as its poster, and falls back to the renders if the model fails to
load or the device cannot run WebGL.

**Convertible earrings (E1, E2) are two meshes, never one fused piece.** Each GLB has:
- `E1_stud` / `E2_stud`: the stud (with its post and gallery), and
- `E1_drop` / `E2_jacket`: the detachable element, plus an empty `E1_lock` / `E2_lock` at the hidden
  loop-and-notch (E1) or post sleeve (E2) where it locks on.

`applyWearState(root, design, 'stud' | 'full')` shows or hides the detachable node. The configurator's
"Wear as" toggle and the try-on (Fitting Registry earrings entry, states `stud` and `full`) use it.
