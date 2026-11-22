# Portrait twin (earrings and necklaces try-on)

Earrings and necklaces try on a 3D portrait twin, the counterpart of the hand twin for rings, bracelets and watches.
"Try on" on a design page opens it full screen (`FittingHand` routes earrings/necklace/pendant to `PortraitTryOn`).

**The bust** (`public/portrait-twin/portrait-bust-v1.glb`, 256 KB) is cut from the MakeHuman 1.x base mesh, CC0
(`LICENSE-makehuman-assets.md`), by `scripts/blender/create_portrait_bust.py`: head, neck and chest to mid-sternum,
subdivided once, eyes painted. Run it with the MakeHuman repo's `makehuman/data/3dobjs/base.obj`. It writes the
anchors (mm, glTF frame) to the root's extras as `ames_bust`: ear lobes, nose bridge, eyes, neck base ring, jugular
notch.

**The look:** `src/lib/portrait-skin.ts`. Physically based skin in the boutique tent light (sheen, clearcoat second
highlight, a warm bleed where light grazes), the hand twin's skin-detail texture triplanar at two scales, and the
portrait fade: skin falls into shadow above the hairline, below the chest and at the shoulder cuts, so no hair asset
is needed and no cut edge shows. The skin tone is the hand twin's (`ames-hand-tone`): one choice for both twins.

**Placement:** `hangEarrings` puts each earring's origin (its stud) at a lobe, stones facing outward and a little
forward (pieces with nodes `Earring left` / `Earring right`; others are cloned for the pair). `setNecklace` opens the
worn loop to clear the neck base and tilts it so the front rests on the chest. Convertible earrings: the Customize
panel's "Wear as" hides the detachable part (same naming rule as the design page).

**Live:** "Use my camera" starts MediaPipe FaceLandmarker (model bundled at build as
`public/hand-tracking/face-v1.task`, fallback `/api/face-model`); the twin follows the head like a mirror, within
about 45°. Without the camera: drag turns, pinch or wheel zooms, and it turns slowly when idle.

**Morphing to the customer's face** (`src/lib/face-morph.ts`, tested by `npm run test:face-morph`). The bust carries
MediaPipe's 468 canonical face landmarks (`face-landmarks-v1.json`, Apache 2.0, written by the bust script when
given `canonical_face_model.obj`): `C`, the average face placed in the bust frame, and `B`, the same points pinned
to the skin (mean pin distance 3.2 mm). With the camera on, 24 steady frames within about 17 degrees of frontal are
averaged and aligned to `C` by a similarity transform (head pose, distance and image scale drop out); what remains
is how this face differs from the average face, per landmark (depth counts 0.6, any landmark at most 12 mm). Those
differences move `B`, and a Gaussian field (sigma 11 mm) carries them over the skin, fading to nothing away from the
face; eyes and the earring lobes move with it, normals are recomputed and welded across seams. The shape is saved
on the device only (`ames-face-shape`) and applied whenever the portrait opens; Customize offers "Shape to my
face" / "Reshape" and "Use the standard face". The first "Use my camera" shapes automatically.

Overall head size is not measured (one camera cannot tell a large face far away from a small one near): the twin
keeps the average adult size, and jewellery is always at true size.

**Full set** (`src/components/FullSetTryOn.tsx`): a collection's "Try on the full set" opens both twins on one
screen (stacked upright, side by side in landscape). The portrait wears every ear and neck piece at once
(`PortraitTryOn` `more`), the hand wears the watch or the bracelet, with a switcher when the set has both. The
collection's still life rests while the set is open, so only the two try-on scenes render.

Not yet: shades (no shades design yet), and a watch and a bracelet on the same wrist at the same time.
