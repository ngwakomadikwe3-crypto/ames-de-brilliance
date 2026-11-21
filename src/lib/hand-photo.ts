// Turning one photo of the back of a hand into a hand shape, skin tone and texture.
// Pure functions over RGBA pixels and MediaPipe landmarks so they can be tested without a browser.
import type { HandShape, Mm3 } from './hand-profile';

export type Pixels = { data: Uint8ClampedArray; width: number; height: number };
export type Pt = { x: number; y: number; z?: number };
type P = { x: number; y: number };

const lum = (d: Uint8ClampedArray, i: number) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];

/** Photo checks. landmarks: normalised image landmarks of the hand (or undefined when none was found). */
export function photoQuality(img: Pixels, landmarks?: Pt[]) {
  const issues: string[] = [];
  const { data, width, height } = img;
  let sum = 0, clipped = 0, dark = 0;
  const n = width * height;
  for (let i = 0; i < n; i++) { const l = lum(data, i * 4); sum += l; if (l > 250) clipped++; if (l < 12) dark++; }
  const mean = sum / n / 255;
  if (mean < 0.22 || dark / n > 0.25) issues.push('Too dark: move to brighter light.');
  if (mean > 0.85 || clipped / n > 0.06) issues.push('Too bright: avoid direct sun or flash glare.');
  // Sharpness: variance of the Laplacian over the hand (or the middle of the frame).
  let x0 = Math.floor(width * 0.25), x1 = Math.ceil(width * 0.75), y0 = Math.floor(height * 0.25), y1 = Math.ceil(height * 0.75);
  if (landmarks?.length === 21) {
    const xs = landmarks.map(p => p.x * width), ys = landmarks.map(p => p.y * height);
    x0 = Math.max(1, Math.floor(Math.min(...xs))); x1 = Math.min(width - 2, Math.ceil(Math.max(...xs)));
    y0 = Math.max(1, Math.floor(Math.min(...ys))); y1 = Math.min(height - 2, Math.ceil(Math.max(...ys)));
  }
  let s = 0, s2 = 0, m = 0;
  const step = Math.max(1, Math.floor(Math.min(x1 - x0, y1 - y0) / 160));
  for (let y = y0; y < y1; y += step) for (let x = x0; x < x1; x += step) {
    const i = (y * width + x) * 4;
    const v = 4 * lum(data, i) - lum(data, i - 4) - lum(data, i + 4) - lum(data, i - width * 4) - lum(data, i + width * 4);
    s += v; s2 += v * v; m++;
  }
  const sharpness = m ? s2 / m - (s / m) ** 2 : 0;
  // The threshold is per sample step: a downsampled sharp photo keeps strong edges.
  if (sharpness < 40) issues.push('The photo is blurred: hold still and tap to focus.');
  if (!landmarks || landmarks.length !== 21) issues.push('No hand found: show the back of your whole hand.');
  else {
    if (landmarks.some(p => p.x < 0.03 || p.x > 0.97 || p.y < 0.03 || p.y > 0.97)) issues.push('Your whole hand and wrist must be inside the frame.');
    const span = Math.hypot((landmarks[5].x - landmarks[17].x) * width, (landmarks[5].y - landmarks[17].y) * height) / Math.min(width, height);
    if (span < 0.16) issues.push('Move the camera closer to your hand.');
    // Fingers slightly spread: neighbouring fingers at least 6 degrees apart.
    const dir = (b: number) => Math.atan2((landmarks[b + 3].y - landmarks[b].y) * height, (landmarks[b + 3].x - landmarks[b].x) * width);
    const angles = [5, 9, 13, 17].map(dir);
    const gaps = angles.slice(1).map((a, i) => Math.abs(Math.atan2(Math.sin(a - angles[i]), Math.cos(a - angles[i]))) * 180 / Math.PI);
    if (Math.min(...gaps) < 6) issues.push('Spread your fingers slightly.');
    // Flat: each finger nearly straight in the picture.
    const straight = [5, 9, 13, 17].every(b => {
      const len = [0, 1, 2].reduce((t, k) => t + Math.hypot(landmarks[b + k + 1].x - landmarks[b + k].x, landmarks[b + k + 1].y - landmarks[b + k].y), 0);
      return Math.hypot(landmarks[b + 3].x - landmarks[b].x, landmarks[b + 3].y - landmarks[b].y) / len > 0.86;
    });
    if (!straight) issues.push('Lay your hand flat with the fingers straight.');
  }
  return { ok: issues.length === 0, issues, brightness: mean, sharpness };
}

/** Width of the skin across a segment, found where the colour changes on both sides (pixels), or 0. */
function widthAcross(img: Pixels, a: P, b: P, t: number, maxPx: number) {
  const { data, width, height } = img;
  const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
  const len = Math.hypot(b.x - a.x, b.y - a.y); if (len < 1) return 0;
  const nx = (b.y - a.y) / len, ny = (a.x - b.x) / len;
  const at = (px: number, py: number) => { const i = 4 * (Math.round(py) * width + Math.round(px)); return [data[i], data[i + 1], data[i + 2]]; };
  const ref = at(x, y);
  const side = (sign: number) => {
    let run = 0;
    for (let d = 1; d <= maxPx; d++) {
      const px = x + nx * sign * d, py = y + ny * sign * d;
      if (px < 1 || py < 1 || px >= width - 1 || py >= height - 1) return 0;
      const c = at(px, py);
      run = Math.hypot(c[0] - ref[0], c[1] - ref[1], c[2] - ref[2]) > 48 ? run + 1 : 0;
      if (run === 3) return d - 2;
    }
    return 0;
  };
  const l = side(-1), r = side(1);
  return l && r ? l + r : 0;
}

/** Skin tone: the middle of the brightness range on the back of the hand, so shadows and highlights are ignored. */
export function skinTone(img: Pixels, px: P[]) {
  const samples: number[][] = [];
  for (const base of [5, 9, 13, 17]) for (const t of [0.35, 0.5, 0.65, 0.8]) for (const off of [-0.04, 0, 0.04]) {
    const x = px[0].x + (px[base].x - px[0].x) * t + (px[17].x - px[5].x) * off, y = px[0].y + (px[base].y - px[0].y) * t + (px[17].y - px[5].y) * off;
    const i = 4 * (Math.round(y) * img.width + Math.round(x));
    if (i >= 0 && i < img.data.length - 3) samples.push([img.data[i], img.data[i + 1], img.data[i + 2]]);
  }
  samples.sort((a, b) => (a[0] + a[1] + a[2]) - (b[0] + b[1] + b[2]));
  const mid = samples.slice(Math.floor(samples.length * 0.25), Math.ceil(samples.length * 0.8));
  const avg = [0, 1, 2].map(c => Math.round(mid.reduce((t, s) => t + s[c], 0) / Math.max(1, mid.length)));
  return '#' + avg.map(v => v.toString(16).padStart(2, '0')).join('');
}

/**
 * Shape from the photo. image: normalised landmarks; world: MediaPipe world landmarks (metres) for scale and
 * depth; second: an optional angled photo's world landmarks to average the depths.
 */
export function shapeFromPhoto(img: Pixels, image: Pt[], world: Pt[], second?: Pt[]): HandShape | null {
  if (image.length !== 21 || world.length !== 21) return null;
  const px = image.map(p => ({ x: p.x * img.width, y: p.y * img.height }));
  const spanPx = Math.hypot(px[5].x - px[17].x, px[5].y - px[17].y);
  const spanM = Math.hypot(world[5].x - world[17].x, world[5].y - world[17].y, (world[5].z ?? 0) - (world[17].z ?? 0));
  if (spanPx < 20 || spanM < 0.03) return null;
  const mmPerPx = spanM * 1000 / spanPx;
  // Which hand: on the back of a right hand the index finger is to the left of the little finger.
  const cross = (px[5].x - px[17].x) * (px[9].y - px[0].y) - (px[5].y - px[17].y) * (px[9].x - px[0].x);
  const side: 'right' | 'left' = cross > 0 ? 'right' : 'left';
  // Rest frame: wrist at the origin, +y toward the middle knuckle, +z out of the back of the hand.
  const up = { x: px[9].x - px[0].x, y: -(px[9].y - px[0].y) }, ul = Math.hypot(up.x, up.y);
  const c = up.y / ul, s = up.x / ul;                         // rotate so `up` becomes +y
  const z = (i: number) => {
    const zz = (p: Pt) => p.z ?? 0;
    const d = second ? (zz(world[i]) + zz(second[i])) / 2 - (zz(world[0]) + zz(second[0])) / 2 : zz(world[i]) - zz(world[0]);
    return -d * 1000;                                            // MediaPipe z grows away from the camera
  };
  const joints: Mm3[] = px.map((p, i) => {
    const x = (p.x - px[0].x) * mmPerPx, y = -(p.y - px[0].y) * mmPerPx;
    return [x * c - y * s, x * s + y * c, z(i)];
  });
  const fingers = [2, 5, 9, 13, 17].map((b, f) => {
    const w = widthAcross(img, px[b], px[b + 1], 0.6, spanPx * 0.25) * mmPerPx;
    const fallback = [21, 18.5, 18.5, 17.5, 15.5][f] * spanM * 1000 / 80;
    return w > 9 && w < 32 ? w : fallback;
  });
  const wristPx = widthAcross(img, px[0], px[9], -0.08, spanPx * 0.8) * mmPerPx;
  const palm = spanM * 1000 * 1.08;                              // knuckle line plus the soft edge of the hand
  const wrist = wristPx > 40 && wristPx < 90 ? wristPx : 0.73 * palm;
  return { joints, fingers, palm, wrist, wristDepth: wrist * 0.68, side };
}

/** Square crop around the hand for the texture, and each landmark's position in it (u right, v up). */
export function textureCrop(width: number, height: number, image: Pt[]) {
  const xs = image.map(p => p.x * width), ys = image.map(p => p.y * height);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * 1.35;
  const x0 = cx - size / 2, y0 = cy - size / 2;
  const uv = image.map(p => [(p.x * width - x0) / size, 1 - (p.y * height - y0) / size] as [number, number]);
  return { x0, y0, size, uv };
}
