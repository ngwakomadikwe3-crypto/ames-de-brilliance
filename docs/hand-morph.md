# Hand morph: the hand twin is the customer's own hand

**Capture** (`HandScan`): one photo of the back of the hand, flat, fingers slightly apart, in good light, with the
on-screen guide and automatic checks (sharpness, light, whole hand and wrist in frame, fingers spread and straight);
an optional angled second photo.

**Measure** (`measureHand` in `src/lib/hand-morph.ts`): MediaPipe's hand landmarks on the photo, then
- the length of each of the 20 bones (wrist to knuckles, every phalanx of every finger and the thumb),
- each finger's width at its base (38-40% along the first phalanx) and at its middle joint (PIP; the thumb's IP),
- the palm width just below the knuckles (twice the little-finger side when the thumb's web hides the other edge),
- the wrist width,
all as ratios to the middle finger's length in the same photo, so the camera distance does not matter. Widths are
found where the colour leaves the skin; one that is not found, or is implausible, keeps the base hand's proportion.
The one absolute number, the middle finger's length in mm, starts from the tracker's estimate (or an average adult).

**Morph** (`shapeFromMorph`, `fitTemplate`/`carry` in `src/lib/realistic-hand.ts`): every bone of the sculpted base
hand is scaled to the customer's ratio compared with the base hand's own ratio measured the same way (a flat view);
the base phalanx takes the base width and the phalanges beyond it the middle-joint width; palm and wrist scale on
their own. The skin follows by blending each bone's fit with the skin weights before the skeleton is bound at the
fitted joints, so the rig, weights and joint limits are unchanged. Never one uniform scale.

**Skin and nails**: the tone is sampled over the back of the hand between its shadows and highlights; skin and nail
beds are tinted with it. The photo is projected as the skin (their creases and veins) only when it is sharp and well
lit (`textureWorthy`); otherwise the standard skin detail is used with their tone.

**Preview and fine-tune**: after a scan the hand appears with three sliders (hand size, finger length, skin tone,
the tone as lighter or darker than the scanned one) and is saved only on "Save my hand". "Fine-tune my hand" in
Customize reopens them later; the Customize tone slider adjusts the scanned tone instead of replacing it.

**Profile**: the morph (about 60 numbers) is saved in the hand profile (`ames-saved-hand`, this device only), with
the tone and, when worthy, the photo texture. Delete asks for confirmation; a re-scan replaces the saved hand only when
the customer saves the new one; with no profile the base hand is used.

**Everywhere**: every 3D hand is built by `CloneTryOn` from the same profile: the try-on, the full-set try-on in
Collections and any future hand scene.

**Tests** (`npm run test:hand-morph`, on the real base hand, no browser): a synthetic photo of a hand with known
proportions is measured back (bone ratios within 1%, widths within 10-12%) and gives the same ratios from further
away; a long-fingered and a wide-palmed hand stay different in proportion with every phalanx at its length; every
morph curls into a full fist (MCP 85, PIP 100, DIP 70 degrees) with no more collapsed or stretched triangles at the
joints than the base hand's own fist.
