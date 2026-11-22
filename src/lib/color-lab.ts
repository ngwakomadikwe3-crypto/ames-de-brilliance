// sRGB <-> CIE LAB (D65), for averaging skin colour the way the eye sees it (face and hand scans).
const toLin = (v: number) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const toSrgb = (v: number) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
export function rgbToLab([r8, g8, b8]: number[]) {
  const r = toLin(r8), g = toLin(g8), b = toLin(b8);
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047), y = f(0.2126 * r + 0.7152 * g + 0.0722 * b), z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
export function labToRgb([L, A, B]: number[]) {
  const fy = (L + 16) / 116, fx = fy + A / 500, fz = fy - B / 200;
  const inv = (t: number) => (t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / (24389 / 27));
  const x = 0.95047 * inv(fx), y = inv(fy), z = 1.08883 * inv(fz);
  return [3.2406 * x - 1.5372 * y - 0.4986 * z, -0.9689 * x + 1.8758 * y + 0.0415 * z, 0.0557 * x - 0.2040 * y + 1.0570 * z].map(v => Math.max(0, Math.min(255, toSrgb(Math.max(0, v)))));
}
