// Try-on camera framing, computed from the model, never hard-coded. Given the points to keep in view (posed hand
// joints, a stretch of forearm, the piece) and the camera's field of view and aspect, find the centre and the
// distance at which they fill the chosen share of the frame, with a margin on every side.

export type Framing = 'hand' | 'ring' | 'wrist' | 'portrait';
export type P = { x: number; y: number; z: number };

/** Which landmarks each preset keeps in view, how much forearm, and how much of the frame the subject fills. */
/** Every preset keeps the complete hand in view; they differ in how much forearm shows and how close the camera
 *  sits. `forearm`: mm of forearm below the wrist to include; `fill`: share of the frame the subject fills. */
export const FRAMING_PRESETS: Record<Framing, { joints: number[]; forearm: number; fill: number }> = {
  hand: { joints: Array.from({ length: 21 }, (_, i) => i), forearm: 40, fill: 0.6 },
  ring: { joints: Array.from({ length: 21 }, (_, i) => i), forearm: 5, fill: 0.64 },     // closer: hand back and ring finger
  wrist: { joints: Array.from({ length: 21 }, (_, i) => i), forearm: 80, fill: 0.6 },    // the wrist and lower hand
  portrait: { joints: [], forearm: 0, fill: 0.62 },                                         // head and chest (portrait twin)
};
export const presetFor = (category: string): Framing =>
  category === 'ring' ? 'ring' : category === 'watch' || category === 'bracelet' || category === 'bangle' ? 'wrist'
    : category === 'necklace' || category === 'pendant' || category === 'earrings' || category === 'earring' ? 'portrait' : 'hand';

export interface Fit { centre: P; distance: number; size: { w: number; h: number; d: number } }

/** Centre and camera distance that fit the points (camera looks down -z) in a frame of the given fov and aspect. */
export function fitPoints(points: P[], fovDeg: number, aspect: number, fill: number): Fit {
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const p of points) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
  const w = maxX - minX, h = maxY - minY, d = maxZ - minZ;
  const tan = Math.tan((fovDeg * Math.PI) / 360);
  // the subject can turn (showcase, gestures): across the screen it may show its width or its depth
  const across = Math.max(w, d);
  const byHeight = h / 2 / (tan * fill), byWidth = across / 2 / (tan * aspect * fill);
  return { centre: { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2 }, distance: Math.max(byHeight, byWidth) + d / 2, size: { w, h, d } };
}

/** Zoom range for a fit: in close for detail, out only a little past the full frame (never into empty space). */
export const zoomRange = (fit: { distance: number }) => ({ min: fit.distance * 0.35, max: fit.distance * 1.2 });

/** Does a box of points sit inside the frame with at least `margin` (fraction of the half-frame) on every side? */
export function framedWithMargin(points: P[], centre: P, distance: number, fovDeg: number, aspect: number, margin = 0.05) {
  const tan = Math.tan((fovDeg * Math.PI) / 360);
  return points.every(p => {
    const depth = distance - (p.z - centre.z);
    const nx = (p.x - centre.x) / (depth * tan * aspect), ny = (p.y - centre.y) / (depth * tan);
    return Math.abs(nx) <= 1 - margin && Math.abs(ny) <= 1 - margin;
  });
}
