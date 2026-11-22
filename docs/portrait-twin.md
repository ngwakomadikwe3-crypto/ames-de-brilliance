# Portrait twin (earrings and necklaces try-on)

Earrings and necklaces try on a 3D portrait twin, the counterpart of the hand twin for rings, bracelets and watches.
"Try on" on a design page opens it full screen (`FittingHand` routes earrings/necklace/pendant to `PortraitTryOn`).
Order of work, kept throughout: photographic base mesh first, shading second, personalisation last.

## The head (v2)

`public/portrait-twin/portrait-head-v2.glb` (1.65 MB, meshopt) is built by `scripts/blender/create_portrait_head.py`
from MakeHuman 1.x data (CC0, `LICENSE-makehuman-assets.md`): one parametric head for every face, male or female.

- Skin (head, neck, chest), eyes, teeth and tongue.
- 113 identity shape keys (`id:*`): the six base ethnic/gender macros plus jaw, chin, brow ridge, cheekbones,
  nose bridge, lips, neck and more. They are baked once per customer (`bakeIdentity`), so only the 11 expression
  keys stay live: `ex:blink-l/-r, smile, part, purse, relaxed, open, brows-up, squint, brows-soft, cheeks-up`.
- 478 MediaPipe landmarks pinned to the surface (ray-cast from MediaPipe's own detections on an orthographic render)
  and stored as UVs + mm in `portrait-head-v2.json`.
- Lip zones (`lip-zones-v1.png`): a UV distance field, R = signed mm to the vermillion border, G = signed mm to where
  the lips meet (+ upper). The upper and lower lip are separate material zones with a sharp border, ready for
  lipstick (`setLipstick(colour, amount, gloss)`).

## The look (`src/lib/portrait-materials.ts`, `portrait-grooming.ts`)

Lit by the same HDR studio as the jewellery. Skin: regional tones (forehead, cheeks, nose, jaw, lips), triplanar
pores, SSS wrap and warm transmission through thin parts (ears, nostrils), regional roughness (moister T-zone and
lips), optional stubble, the scalp tinted to the hair colour, a soft brow tone under the brow hairs, and a soft oval
fade below the chest and past the shoulders (no cut edge). Eyes: procedural iris in the scanned iris colour, limbal
ring, sclera, wet clearcoat and catchlights. Hair, brows and lashes are camera-facing strands (Kajiya-Kay):
four styles (short, medium, long, tied back) tinted from the scan, tucked behind the ears so earrings stay in view,
the front hairline brushed back off the face; brows and lashes follow the blink and brow expressions.

## Life (`src/lib/portrait-life.ts`)

Blinks (sometimes double), breathing, a slight sway, an occasional mouth movement. When an earring or necklace goes
on, one Duchenne smile: rises in about 0.5 s (cheeks lift, eyes narrow, brows soften), holds about 2.5 s, settles
into a pleased resting smile. Once per placement; a tap on the twin replays it; never loops. Expression springs are
critically damped and solved exactly, so slow phones cannot make them overshoot. Tested: `npm run test:portrait-life`.

## The guided face scan (`src/components/FaceScan.tsx`, `src/lib/face-scan.ts`)

Frames: front neutral (oval guide, eye line), left profile, right profile, chin up, a smile; an optional 7 s video
sweep adds up to 10 more angles. Every frame must pass the gates, or it is retaken on the spot with a reason:
sharpness (variance of the Laplacian), brightness, even light across the cheeks, the whole face in frame, and the
step's angle confirmed from the landmarks (level means the nose tip 0.31 of the way from the eye line to the chin, as
on MediaPipe's canonical face). Tested: `npm run test:face-scan` (blurry, half-lit, dark, cropped and wrong-angle
frames are rejected).

Fitting (`src/lib/portrait-fit.ts`, `npm run test:portrait-fit`): a joint Gauss-Newton fit of the 113 identity
weights (bounded, active-set least squares) and a 7-DOF pose per frame, across all frames at once; the profiles fix
depth (error 2.9 mm front only, 1.2 mm with profiles). Scale from the iris (11.7 mm). The smile frame calibrates the
customer's own smile mix. Regional skin tones, hair colour, stubble density and iris colour come from the front
photo; photo colour is laid on the face where the camera saw it well, blending to standard at the ears, hairline
and neck. Spectacles: pupillary distance, bridge width and projection, temple-to-temple width, ear rests and
eye-to-ear length are measured on the fitted head and stored for frames.

Before saving, the twin is shown beside the photo: Save my twin / Retake / Cancel. A re-scan replaces the saved
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
