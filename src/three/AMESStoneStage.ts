import { DataTexture, LinearFilter, RGBAFormat, SRGBColorSpace, TextureLoader } from 'three';

/** Opaque-canvas backdrop: exact app emerald at every edge, quiet studio lift within. */
export function createAMESStoneStage() {
  const size = 128;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / (size - 1), v = y / (size - 1);
      const radius = Math.hypot((u - 0.5) / 0.49, (v - 0.46) / 0.44);
      const falloff = Math.max(0, 1 - radius * radius);
      const glow = falloff * falloff * falloff;
      const offset = (y * size + x) * 4;
      pixels[offset] = Math.round(6 + 9 * glow);
      pixels[offset + 1] = Math.round(60 + 12 * glow);
      pixels[offset + 2] = Math.round(59 + 12 * glow);
      pixels[offset + 3] = 255;
    }
  }
  const texture = new DataTexture(pixels, size, size, RGBAFormat);
  texture.name = 'AMES emerald stone backdrop';
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/** Loads the shared silk image for the opaque WebGL canvas so its edges blend with the app shell. */
export async function loadAMESStoneStage(url = '/ames-silk-bg.webp') {
  const texture = await new TextureLoader().loadAsync(url);
  texture.name = 'AMES emerald silk stone backdrop';
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}
