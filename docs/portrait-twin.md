# Portrait twin (earrings and necklaces try-on)

Earrings and necklaces try on a 3D portrait twin, the counterpart of the hand twin for rings, bracelets and watches.
"Try on" on a design page opens it full screen (`FittingHand` routes earrings/necklace/pendant to `PortraitTryOn`).
Order of work, kept throughout: photographic base mesh first, shading second, personalisation last.

## The head (v2)

`public/portrait-twin/portrait-head-v2.glb` (1.65 MB, meshopt) is built by `scripts/blender/create_portrait_head.py`
from MakeHuman 1.x data (CC0, `LICENSE-makehuman-assets.md`): one parametric head for every face, male or female.

- Skin (head, neck, chest), eyes, teeth and tongue.
- 114 identity shape keys (`id:*`): the six base ancestry/sex macros (gender presentation), age (`id:age-old`, the
  mean old-minus-young of the six), and jaw width, chin height, cheekbones, nose bridge/width/tip, lip thickness,
  mouth width, eye spacing/size, brow ridge, forehead slope, neck thickness and more. They are baked once per customer (`bakeIdentity`), so only the 11 expression
  keys stay live: `ex:blink-l/-r, smile, part, purse, relaxed, open, brows-up, squint, brows-soft, cheeks-up`.
- 478 MediaPipe landmarks pinned to the surface (ray-cast from MediaPipe's own detections on an orthographic render)
  and stored as UVs + mm in `portrait-head-v2.json`.
- Lip zones (`lip-zones-v1.png`): a UV distance field, R = signed mm to the vermillion border, G = signed mm to where
  the lips meet (+ upper). The upper and lower lip are separate material zones with a sharp border, ready for
  lipstick (`setLipstick(colour, amount, gloss)`).

## Morph rules and the twin lab

Every set of identity weights passes `src/lib/portrait-weights.ts` before it touches the mesh: one scalar weight per
named target on its baked delta (nothing else moves vertices); each opposing pair (…-decr/-incr, -down/-up, -in/-out,
-backward/-forward) is ONE axis in [-1, 1], never both halves; every feature target is limited to the weight at which
it moves the skin at most 9 mm (MakeHuman's targets reach caricature at 1.0: the forehead bulge moves 58 mm); the six
ancestry/sex shapes sum to exactly 1. The scan solve uses these limits as its bounds.

`npm run test:portrait-morphs` (with `npm run audit:portrait-morphs` for the full table): all weights 0 is the
symmetric MakeHuman base (mirror mismatch under 0.1 mm); every target alone is smooth and mirror-symmetric (except
the one-eyed blinks); the smile and cheek raise never move the eyelids.

**Twin lab** (`/dev/twin-lab`, development and preview deployments only): one slider per morph axis and per
expression, live on the model, clay or skin, wireframe, "All 0 (MakeHuman base)", "Average adult", "My twin", and a
contact sheet that renders every target alone at 0.5 and 1.0 (front) and 1.0 (profile). Link presets for checks:
`?twin=1&smile=1&look=skin&yaw=0`.

Expressions are built region-clean (create_portrait_head.py): the smile moves only the mouth (corners up and out, the
upper lip lifting off the teeth, nothing above the nose); the cheek raise only the cheeks (about 5 mm at full weight,
used at most 0.3); the squint is capped at 0.15. Eyes stay open at rest and in the smile.

## The look (`src/lib/portrait-materials.ts`, `portrait-grooming.ts`)

Lit by the same HDR studio as the jewellery, ACES Filmic. Roughness by zone: T-zone ~0.42, cheeks ~0.55, lips
glossier... Bare lips: the sampled lip tone muted (saturation -40 %) and drawn toward the skin, roughness 0.5, no clearcoat or sheen (a glossy lipstick brings its own). Teeth warm off-white #EDE6DA, roughness 0.3, a faint fill. Skin: regional tones (forehead, cheeks, nose, jaw, lips), triplanar
pores, SSS wrap and warm transmission through thin parts (ears, nostrils), regional roughness (moister T-zone and
lips), optional stubble, the scalp tinted to the hair colour, a soft brow tone under the brow hairs, and a soft oval
fade below the chest and past the shoulders (no cut edge). Eyes: MakeHuman's high-poly eye proxy (CC0; 24 mm eyeballs, an 11.7 mm iris), fitted to the face so every shape
morph moves them, with MakeHuman's photographic eye texture (real sclera and vessels; the iris re-coloured to the scan's
iris colour with its fibres kept), wet and glossy; a clear corneal dome bulging over each iris
(its highlights slide as the head turns), and a wet tear line along each lower lid (`portrait-eyes.ts`). Mouth: teeth,
tongue and a dark mouth cavity behind them. Hair, brows and lashes are camera-facing strands (Kajiya-Kay):
a close crop by default (the scalp tinted from the sampled hair colour with fine grain, a natural hairline with
temples, short sideburns and the line over the ears), or four strand styles (short, medium, long, tied back) tinted from the scan, tucked behind the ears so earrings stay in view,
the front hairline brushed back off the face; brows and lashes follow the blink and brow expressions.

## Life (`src/lib/portrait-life.ts`)

Blinks (sometimes double), breathing, a slight sway, an occasional mouth movement. When an earring or necklace goes
on, one Duchenne smile: rises in about 0.5 s (cheeks lift, eyes narrow, brows soften), holds about 2.5 s, settles
into a pleased resting smile. Once per placement; a tap on the twin replays it; never loops. Expression springs are
critically damped and solved exactly, so slow phones cannot make them overshoot. Tested: `npm run test:portrait-life`.

## The guided face scan (`src/components/FaceScan.tsx`, `src/lib/face-scan.ts`, `src/lib/twin-build.ts`)

Three required frames: front neutral (oval guide, eye line), about 45 degrees to one side, about 45 degrees to the
other (accepted between about 35 and 60 degrees). Then optional: chin up and a smile (teaches the twin the
customer's own smile), or a 7 s sweep. Every frame must pass the gates, or it is retaken on the spot with a reason:
sharpness (variance of the Laplacian), brightness, even light across the cheeks, the whole face in frame, and the
step's angle confirmed from the landmarks (level means the nose tip 0.31 of the way from the eye line to the chin, as
on MediaPipe's canonical face). Tested: `npm run test:face-scan` (blurry, half-lit, dark, cropped and wrong-angle
frames are rejected).

Fitting (`src/lib/portrait-fit.ts`, `npm run test:portrait-fit`): a joint Gauss-Newton fit of the identity
weights (bounded to their sane range, active-set least squares: a weight that would leave its range is clamped and
the rest re-fitted; overall head scale is not fitted, it cannot be told from distance) and a 7-DOF pose per frame, across all frames at once; the profiles fix
depth (error 2.9 mm front only, 1.2 mm with profiles). True size: the head is scaled so its pupils are as far apart as the customer's (from the irises, 11.7 mm; the adult
mean 63 mm when the irises cannot be measured), so earrings and pendants sit at true size. The smile frame calibrates the
customer's own smile mix. **Skin tone**: albedo from stable patches of both cheeks and the forehead, each pixel in LAB, the darkest 25 % and
brightest 20 % by lightness dropped (shadows, highlights), averaged in LAB (`color-lab.ts`); subtle zones from it
(nose and cheeks a touch redder, jaw darker, forehead lighter). Never a flat fill: it multiplies into the skin map.

**Skin texture** (`src/lib/skin-bake.ts`): every frame's photo is projected onto the face's own island of the UV
atlas (found by connectivity from the nose tip, so its 1024 px land on the face, not the whole body) through
its fitted pose: weighted by how squarely the photo sees each point (feathered at the silhouette), visible only if
the head's own depth from that camera says so (the nose hides part of the far cheek), only inside the face's outline
in that photo, never the eye openings, and only skin-hued samples (the room behind never comes through). The front
frame is favoured. The map holds detail only: the photo divided by a blurred copy of itself (about 7 mm), colour by
colour, so pores, freckles, moles and fine lines transfer but no broad patch can (no blotches, ever): the face's broad
colour is the LAB tone with its smooth zones. Nothing past ~65 degrees from a camera is taken (stretched, shadowed edge texels), views overlap and blend by facing across the whole nose bridge, and a 5 px blur runs across the blend band only (no seam line). The photo's own shadows (a region darker than its ~35 mm surroundings at ~12 mm: beside the nose, under the hairline and brows) are not projected; the skin tint shows there. Confidence is feathered and colour bled 14 px past every island edge;
unseen skin keeps the tone (no mirror fill: it would copy a mole to the other cheek). Stored as a colour ratio JPEG plus a small confidence JPEG on the device (about 60-250 KB). The tiling pore
normal detail stays at low strength on top.

Hair colour, stubble and iris colour also come from the front photo. Spectacles: pupillary distance, bridge width and projection, temple-to-temple width, ear rests and
eye-to-ear length are measured on the fitted head and stored for frames.

Before saving, the twin is shown beside the photo: Save my twin / Fine-tune / Retake / Cancel. Fine-tune (also in
Customize later) is a set of sliders over the solved face (jaw, chin, cheekbones, brow ridge, forehead, nose bridge,
width and tip, lips, mouth width, eye size and spacing, age, neck), each clamped to its sane range; "Back to my scan"
undoes them. A re-scan replaces the saved
twin only when it succeeds. Copy: "Your twin is a likeness built from your photos, not an exact 3D scan."

## One identity (`src/lib/twin-profile.ts`)

Face and hands are one person: one profile on the device (`ames-twin` + the hand profile), one harmonised skin tone
(the face's cheeks and the back of the hand reconciled in linear light; each twin keeps at most a slight natural
offset), applied everywhere the twins appear (try-on, collections, full set). When only one scan exists, its tone
dresses both twins. "Delete my twin" (in either twin's Customize) wipes face, hand, tones and preferences.

## Placement and live view

`hangEarrings` puts each earring's stud at a lobe; `setNecklace` opens the loop round the neck base and rests it on
the chest. Convertible earrings: "Wear as" hides the detachable part. "Move with me" starts MediaPipe
FaceLandmarker (bundled `public/hand-tracking/face-v1.task`, fallback `/api/face-model`) and the twin mirrors the
head. Without the camera: drag turns, pinch or wheel zooms.

**Full set** (`FullSetTryOn.tsx`): the portrait wears every ear and neck piece, the hand the watch or bracelet.

Not yet: a separate tear-line mesh (the wet lid line is shaded), true corneal refraction (a clearcoat stands in),
shades designs.
