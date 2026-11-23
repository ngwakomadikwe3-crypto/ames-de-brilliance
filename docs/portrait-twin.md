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

## Live mirroring (System 3) and expression-reactive skin (System 4)

With "Move with me", MediaPipe FaceLandmarker's 52 blendshape channels drive the twin's 52 'ar:*' shapes every frame
(`face-mirror.ts`): One Euro filter, dead zone, velocity clamp, mirrored left/right; a step reaches 90 % within about
120 ms at 30 fps and a held expression does not jitter (`npm run test:face-mirror`). The eye-look channels turn each
eyeball about its true centre (cornea with it), within the lids' range; blinks and brows move the lash and brow
strands. The placement smile stays layered on top; without a tracked face the idle life runs as before. The 'ar:*'
shapes are built from MakeHuman's expression units (one-sided ones as smooth half-face masks; jaw/mouth shifts and cheek
puff as rigid moves under smooth masks) and pass the morph smoothness test.

Expression-reactive skin (flag 'expression-skin'): forehead lines with raised brows, nasolabial folds with each side's
smile, crow's feet with the squint, as normal-only folds in the skin shader that fade in with the channel and are gone at
neutral; a warm cheek flush builds while a smile is held and fades after.

Flags (`twin-flags.ts`): 'live-mirror', 'expression-skin' (on), turned off per visit with `?flags=-live-mirror` or per
device in localStorage 'ames-flags'. The twin lab has an A / A+B / A+B+C switch for the skin's layers (A base skin, B the
scan photo, C lips and teeth).

## Face refinement (System 1): built, measured, off by default

FLAME (under DECA and EMOCA) is licensed for non-commercial use only, so System 1 takes the free route: the morph
solve, then a per-vertex refinement toward the scan (`face-refine.ts`, flag `face-refine`):

- **Offsets.** For each of MediaPipe's 468 landmarks, one weighted least squares across all frames finds its offset.
  x and y are sharp, camera depth counts 0.08, and the far side of a turn counts 0.1.
- **Clean-up.** A soft 0.3 mm noise threshold, 5 mm neighbour smoothing, a 7 mm cap, and nothing at all within 7–15 mm
  of the eye openings.
- **Spread.** The offsets reach the skin as a smooth Gaussian field that fades to zero away from the face, so the
  scalp, ears, neck and every jewellery anchor stay where the rig puts them.

The result is saved with the twin as about 13 KB. The twin lab has a "refine" toggle for it.

**Measured.**
- **Simulated landmarks** (`npm run test:face-refine`): on a person with a bent nose, a wider jaw and a hollow cheek,
  the refinement is 40–60 % closer than the morph solve at the nose, jaw and cheek. The front silhouette is 45 %
  tighter, and a face the morphs already explain is not made worse.
- **Real detector:** subject `c` (the same quirks) was rendered and read by the real MediaPipe. The harness overlay
  (`entry-refine.tsx`) then measured the face silhouette:
  - front: 16.5 → 15.1 px;
  - 42° turn: 19.9 → 24.6 px (worse);
  - nose edge: no change.

The reason is that MediaPipe's landmark model has a strong prior of its own. It did not register the 3 mm nose bend at
all. Its per-landmark offsets on our head also differ between people, so a fixed calibration made one subject worse
(`scripts/calibrate-landmarks.mjs`, leave-one-out). The landmarks alone cannot carry this detail, so the flag stays
off. The next step is a silhouette fit against a face-skin segmentation (MediaPipe's selfie multiclass model). That
needs the model file in `public/`, and this build environment cannot download it.

### Round 2: outline fit (dual-source). Result: FAIL, flag stays off

`face-outline.ts` with `face-segment.ts`:

- **Segmentation.** MediaPipe's selfie multiclass segmenter (Apache-2.0) labels the face skin in each of the three
  photos. The model is fetched at build to `public/hand-tracking/segment-v1.tflite`, with `/api/segment-model` as the
  fallback.
- **Territories.** The outline (face-skin edge) moves only the jaw, cheeks, temples and chin. The landmarks keep the
  features: the nose, lips, eyes and brows are excluded from the outline, with a 6 mm fade.
- **Joint fit.** Each round re-places every photo (2D shift and scale from its own outline gaps). It then collects
  occluding-contour observations from all three photos, using a z-buffer to skip hidden contour points. The
  observations are spread as one Gaussian field (10 mm), smoothed four times over the mesh and clamped to 6 mm. There
  are three rounds.
- **Hard limits** (`npm run test:face-outline`):
  - the scalp, ears and neck have exactly zero weight;
  - features are never outline;
  - no weight step along any mesh edge exceeds 0.5;
  - 1,813 of 20,208 skin vertices can move;
  - the eyeballs are separate meshes and never move.

**Acceptance** (subject c, real MediaPipe face mesh and segmenter on rendered photos, `entry-refine.tsx`):

| px | front | 42° turn |
|---|---|---|
| gate | < 15.1 | < 19.9 |
| morph solve | 16.47 | 19.88 |
| outline fit | **16.36** | **20.51** |
| true silhouette (face vs background): morph → outline fit | 10.24 → 10.89 | 11.10 → 11.04 |
| aligned on all face vertices instead of landmarks: morph → outline fit | 17.16 → 16.90 | 20.77 → 21.61 |

Neither view passes its gate, and the turned view regresses, so this is a FAIL under the rule. Flag `face-refine`
stays off, the morph solve remains the default, and the twin lab's refine toggle works for both record types.

**What the numbers say:**
- The segmenter is accurate: its face edge is 1.36 px (front) and 2.94 px (turn) from the true silhouette.
- The fit does match the photos. The mean outline gap fell from 9.5 to 3.9 px (front) and from 6.3 to 4.3 px (turn)
  over the three rounds.
- The head's shape against the truth did not improve, because the remaining ~10–20 px are dominated by where the head
  is placed against the face. That placement comes from MediaPipe's landmarks, whose positions on a head vary by face
  (round 1). A better outline fit cannot correct a placement error it is measured through.
- **Next lever, not built:** solve placement and shape together from the outline, with the landmarks only as a weak
  prior. Expect to re-measure the same table.

## Room light

Flag `room-light`, on by default (`room-blend.ts`). Only while the camera is on, a 32×24 mirrored camera frame is
read a few times a second. Its mean gives the light's brightness and colour, and its weighted centroid gives its
direction. Together these are a first-order spherical-harmonic read of the room.

That read moves the studio key at most halfway toward the room's light, never from below or behind. It tints the key
without changing its brightness and keeps the exposure within ±25 %, easing over about a second. With the camera off,
the studio rig comes back exactly. `npm run test:room-blend` covers this.

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

**Skin layers**: A, the base skin with no photo (LAB tone and zones, ±3 % mottling, pores, wrap SSS, zone roughness); B, the front scan photo on top, only within 45° of the front camera's axis (feathered over the last 10°), shadow and highlight outliers rejected; C, the lips' and teeth's own materials. The brows and lashes are a locked features layer over all three (`portrait-features.ts`, `npm run test:portrait-features`). The skin sees the jewellery HDR turned −0.7 rad (`SKIN_ENV_YAW`) so the tent's main light faces the face and both cheeks read the same tone.

**Skin texture** (`src/lib/skin-bake.ts`, Layer B): every frame's photo is projected onto the face's own island of the UV
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
