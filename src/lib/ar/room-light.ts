// Read the room from the camera: overall brightness, the side the light comes from, and its colour.
// Input is a small RGBA frame already mirrored to match the screen.
export type RoomLight = { luminance: number; direction: [number, number, number]; colour: [number, number, number] };
export function estimateRoomLight(data: Uint8ClampedArray, width: number, height: number): RoomLight {
  let sum = 0, sw = 0, sx = 0, sy = 0, r = 0, g = 0, b = 0, n = 0;
  const lin = (v: number) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = 4 * (y * width + x);
    const R = lin(data[i]), G = lin(data[i + 1]), B = lin(data[i + 2]);
    const L = 0.2126 * R + 0.7152 * G + 0.0722 * B;
    sum += L; r += R; g += G; b += B; n++;
    // Weight by the square so bright windows and lamps dominate the direction.
    const w = L * L; sw += w; sx += w * (x / (width - 1) - 0.5); sy += w * (0.5 - y / (height - 1));
  }
  const luminance = n ? sum / n : 0;
  const dx = sw ? (sx / sw) * 2 : 0, dy = sw ? (sy / sw) * 2 : 0;
  const len = Math.hypot(dx, dy, 1);
  const m = Math.max(r, g, b) || 1;
  return { luminance, direction: [dx / len, dy / len, 1 / len], colour: [r / m, g / m, b / m] };
}
/** Exposure that keeps metal and stones as bright as the skin around them: darker rooms, darker jewellery. */
export const exposureFor = (luminance: number) => Math.max(0.45, Math.min(1.5, 0.55 + 2.2 * Math.sqrt(Math.max(0, luminance))));
