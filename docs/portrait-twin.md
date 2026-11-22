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

Not yet: scaling the twin to the customer's own face (the tracker's measurements), shades (no shades design yet),
and the two-twin full-set try-on for Collections.
