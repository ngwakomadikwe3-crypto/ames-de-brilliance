# Wand gestures (try-on hand control)

Engine: `src/lib/wand-gestures.ts`. Used by `CloneTryOn.tsx` (the 3D-hand try-on) and `HandClasp.tsx` (the
"Use hand gestures" viewer). The older `gesture-controller.ts` stays only for `ArTryOn`'s `classifyPose` and its test.

## Detection (robustness first)

- **Orientation-invariant fingers.** A finger is extended when tip-to-wrist > 1.6 × knuckle-to-wrist, and curled below
  1.2. Between the two it keeps its last state (hysteresis). The thumb is judged by its reach to the pinky knuckle
  (0.78 / 0.62 hand sizes).
- **Confidence gate.** Frames with handedness confidence below 0.6 freeze the state machine. Nothing changes and nothing
  fires.
- **Smoothing.** Landmarks are normalised to hand size and pass a One Euro filter (min cutoff 1.0). The aim vector then
  passes an EMA: α 0.2 when steady, rising to 0.8 while it swings, so stops stay quick.
- **State machine.** IDLE → ARMING (250 ms; 500 ms for the fist) → WAND / DOUBLE / PINCH / FROZEN / RESET. Every change
  goes through a 150 ms NEUTRAL check, and there is a 400 ms cooldown after a release.
- **Frame rates.** Tracking runs at camera rate. Motion is an angular velocity that the render loop integrates per
  `requestAnimationFrame` from a mutable ref, so there is no React state per frame.

## Vocabulary

| Gesture | Hand | Effect |
|---|---|---|
| Wand ("Levitate") | index only | Pointing up or down sets the tilt velocity, all the way round. Dead zone ±8°, full speed (120°/s) at 55°. |
| Double wand ("Sweep") | index + middle, ring and pinky curled | Pointing left or right sets the turn velocity, all the way round. |
| Pinch | thumb–index ratio < 0.35 (released at 1.1) | Zoom, as before. |
| Open palm, 250 ms | all fingers out | Freeze toggle (latched). Pinch still zooms while frozen. |
| Fist, 500 ms | all curled | Reset the view and unfreeze. |

When a hand is ambiguous, the priority is wand > double > pinch. A pinching index finger is never treated as a wand.

## Feel

- **Glint.** A warm-gold glint (~6 px, opacity 0.4, additive) sits on the active fingertip: the twin's own index tip,
  or between the index and middle tips. It is off for palm and fist.
- **Lift.** On lock-in the piece lifts with a 150 ms ease-in (scale 1.00 → 1.03) and a warm rim light. On release it
  settles over 250 ms with an ease-out cubic.
- **Stops.** Rotation stops ease out.
- **Haptics.** `navigator.vibrate(8)` fires on lock-in, on Android only.

## Tests

`npm run test:wand-gestures` checks:

- all five poses at 200/200 random orientations;
- wand and double wand at 20/20 rolls;
- point-and-hold: a smooth spin past 360° that never exceeds 120°/s and returns to the dead zone within 300 ms;
- the confidence gate;
- freeze and reset;
- a 60 s random stress test with noise and garbage frames: zero false triggers and no stuck states.
