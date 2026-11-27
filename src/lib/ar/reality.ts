// HOUSEofAMES "reality" compositing for the live camera try-ons (hand and face): the jewellery is rendered so it
// looks filmed by the same phone camera as the customer, not pasted on top. The idea follows VFX practice (and
// apps like Simulon): light the CG with the real room, then match the camera's look.
//
//  1. Room light as HDR: the camera picture becomes a 360° environment in linear half-float, with the brightest
//     parts (windows, lamps, screens) expanded back to their real intensity so polished metal and stones catch
//     real highlights and sparkle (an inverse tone map; a phone picture clips them).
//  2. Camera look: from a tiny frame we measure the camera's black level, white clip, sensor grain and softness,
//     and grade only the jewellery to match: the same lifted blacks, the same roll-off, the same noise, the same
//     slight lens softness, and a little light wrap (the room's light spilling over the jewellery's edges).
//  3. The photo: rendered at the camera's full resolution with sub-pixel jitter averaged over several frames
//     (supersampling), so the saved picture has film-like edges instead of jagged CG ones.
//
// Everything is automatic: nothing for the customer to set.
import {
  DataTexture, EquirectangularReflectionMapping, FloatType, HalfFloatType, LinearFilter, LinearSRGBColorSpace, Mesh,
  OrthographicCamera, PlaneGeometry, PMREMGenerator, RGBAFormat, Scene, ShaderMaterial, Vector2,
  WebGLRenderTarget, type Camera, type Object3D, type Texture, type WebGLRenderer,
} from 'three';

export type CameraLook = { black: number; white: number; grain: number; soft: number; saturation: number };
export const neutralLook: CameraLook = { black: 0.0, white: 1.0, grain: 0.0, soft: 0.0, saturation: 1 };

const toLinear = (v: number) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };

/**
 * Measure the camera's look from a small RGBA frame: black level and white clip (as display values 0..1, from
 * the 1st and 99.5th luminance percentiles), grain (noise against the 3x3 neighbourhood in flat areas), softness
 * (how little fine detail survives) and colourfulness.
 */
export function measureLook(data: Uint8ClampedArray, width: number, height: number): CameraLook {
  const n = width * height, luma = new Float32Array(n);
  let sat = 0;
  for (let i = 0; i < n; i++) {
    const r = data[4 * i], g = data[4 * i + 1], b = data[4 * i + 2];
    luma[i] = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b); sat += mx ? (mx - mn) / mx : 0;
  }
  const sorted = Float32Array.from(luma).sort();
  const black = sorted[Math.floor(n * 0.01)], white = sorted[Math.min(n - 1, Math.floor(n * 0.995))];
  let noise = 0, flat = 0, detail = 0, edges = 0;
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    const i = y * width + x;
    let mean = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) mean += luma[i + dy * width + dx];
    mean /= 9;
    const d = Math.abs(luma[i] - mean);
    const gx = luma[i + 1] - luma[i - 1], gy = luma[i + width] - luma[i - width], grad = Math.hypot(gx, gy);
    if (grad < 0.02) { noise += d; flat++; } else { detail += d / grad; edges++; }
  }
  const grain = flat ? Math.min(0.06, (noise / flat) * 1.25) : 0;
  // detail/grad is high when edges are crisp (a big jump against its neighbourhood) and low when they are soft.
  const crisp = edges ? detail / edges : 0.25;
  const soft = Math.max(0, Math.min(1, (0.32 - crisp) / 0.2));
  return { black: Math.min(0.12, black), white: Math.max(0.75, white), grain, soft, saturation: Math.min(1.08, Math.max(0.9, (sat / n) * 1.2 + 0.78)) };
}

/** Ease one look toward another (camera auto-exposure changes slowly; so should the grade). */
export function easeLook(from: CameraLook, to: CameraLook, k: number): CameraLook {
  const m = (a: number, b: number) => a + (b - a) * k;
  return { black: m(from.black, to.black), white: m(from.white, to.white), grain: m(from.grain, to.grain), soft: m(from.soft, to.soft), saturation: m(from.saturation, to.saturation) };
}

/**
 * The room as an HDR environment from a small, already-mirrored camera picture on a 2D canvas: the picture
 * wraps the front half of the sphere, a blurred mirror of it the back half, and highlights are expanded
 * (up to ~16x) so they light the jewellery like the real lamps and windows do.
 */
export class CameraEnvironment {
  private pmrem: PMREMGenerator; private target?: WebGLRenderTarget; private texture: DataTexture;
  private data: Float32Array; private w: number; private h: number;
  constructor(renderer: WebGLRenderer, width = 128, height = 64) {
    this.pmrem = new PMREMGenerator(renderer); this.w = width; this.h = height;
    this.data = new Float32Array(width * height * 4);
    this.texture = new DataTexture(this.data, width, height, RGBAFormat, FloatType);
    this.texture.mapping = EquirectangularReflectionMapping; this.texture.colorSpace = LinearSRGBColorSpace;
    this.texture.magFilter = this.texture.minFilter = LinearFilter;
  }
  /** pixels: the room picture already drawn (mirrored, blurred a little) at width x height. Returns the PMREM env. */
  update(pixels: Uint8ClampedArray): Texture {
    const { w, h, data } = this;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = 4 * (y * w + x);
      const r = toLinear(pixels[i]), g = toLinear(pixels[i + 1]), b = toLinear(pixels[i + 2]);
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      // inverse tone map: values near the clip were brighter than the camera could record
      const t = Math.max(0, Math.min(1, (l - 0.55) / 0.4)), boost = 1 + 15 * t * t * t;
      // the back of the sphere (behind the camera) sees the room less directly: darker, as in a real room
      const back = Math.abs(x / (w - 1) - 0.5) > 0.25 ? 0.55 : 1;
      data[i] = r * boost * back; data[i + 1] = g * boost * back; data[i + 2] = b * boost * back; data[i + 3] = 1;
    }
    this.texture.needsUpdate = true;
    const next = this.pmrem.fromEquirectangular(this.texture);
    this.target?.dispose(); this.target = next;
    return next.texture;
  }
  dispose() { this.target?.dispose(); this.texture.dispose(); this.pmrem.dispose(); }
}

/** Draw the camera frame into a 2:1 equirect room picture: the frame centred, its blurred mirror wrapping behind. */
export function drawRoom(ctx: CanvasRenderingContext2D, video: CanvasImageSource, width: number, height: number, mirrored = true) {
  ctx.save();
  ctx.filter = 'blur(10px)';
  // the back half: the same picture, flipped, spread wide (light from around and behind the customer)
  ctx.setTransform(mirrored ? 1 : -1, 0, 0, 1, mirrored ? 0 : width, 0);
  ctx.drawImage(video, 0, 0, width, height);
  ctx.filter = 'blur(3px)';
  // the front: the camera's own view over the middle half, as the jewellery facing the camera sees it
  ctx.setTransform(mirrored ? -1 : 1, 0, 0, 1, mirrored ? width : 0, 0);
  ctx.drawImage(video, width * 0.25, 0, width * 0.5, height);
  ctx.restore();
}

const COMPOSITE_VERTEX = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const COMPOSITE_FRAGMENT = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D frame;      // the whole picture (camera + jewellery), linear HDR
  uniform sampler2D mask;       // the jewellery's coverage (alpha)
  uniform vec2 texel;
  uniform float exposure, black, white, grain, soft, saturation, time, mirror;
  vec3 aces(vec3 x){ x *= 0.6; return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }
  vec3 toSRGB(vec3 c){ c = max(c, 0.0); return mix(c*12.92, 1.055*pow(c, vec3(1.0/2.4))-0.055, step(0.0031308, c)); }
  float hash(vec2 p){ p = fract(p*vec2(443.897, 441.423)); p += dot(p, p.yx+19.19); return fract((p.x+p.y)*p.x); }
  void main(){
    vec2 uv = vec2(mirror > 0.5 ? 1.0 - vUv.x : vUv.x, vUv.y);
    vec3 c = texture2D(frame, uv).rgb;
    float m = texture2D(mask, uv).a;
    // the camera picture stays exactly as filmed
    vec3 film = toSRGB(clamp(c, 0.0, 1.0));
    if (m < 0.002) { gl_FragColor = vec4(film, 1.0); return; }
    // lens softness: blend toward a small blur of the jewellery as soft as the camera's own detail
    vec3 b = (texture2D(frame, uv+vec2(texel.x,0.0)).rgb + texture2D(frame, uv-vec2(texel.x,0.0)).rgb
            + texture2D(frame, uv+vec2(0.0,texel.y)).rgb + texture2D(frame, uv-vec2(0.0,texel.y)).rgb) * 0.25;
    c = mix(c, b, soft * 0.6);
    // light wrap: the room's light bleeding over the jewellery's edges
    float edge = clamp(1.0 - m, 0.0, 1.0) * 4.0 * m;
    vec3 room = (texture2D(frame, uv+vec2(texel.x*3.0,0.0)).rgb + texture2D(frame, uv-vec2(texel.x*3.0,0.0)).rgb) * 0.5;
    c += room * edge * 0.18;
    // the camera's tone curve: filmic roll-off, then its black level and white clip, and its colourfulness
    vec3 j = aces(c * exposure);
    j = black + j * (white - black);
    float l = dot(j, vec3(0.2126, 0.7152, 0.0722));
    j = mix(vec3(l), j, saturation);
    // sensor grain, the same strength as the camera's (luminance noise, a touch of chroma)
    float n = hash(gl_FragCoord.xy + time) - 0.5, n2 = hash(gl_FragCoord.yx + time*1.7) - 0.5;
    j += grain * (n * 1.6 + vec3(n2, -n2*0.5, n2*0.3) * 0.4);
    gl_FragColor = vec4(mix(film, toSRGB(clamp(j, 0.0, 1.0)), clamp(m * 1.15, 0.0, 1.0)), 1.0);
  }`;

/**
 * Two passes per frame: the full scene (camera backdrop + jewellery, so stones refract the real skin) into a
 * half-float target, and the jewellery's coverage into a small mask; then one composite to the screen that
 * grades only the jewellery to the camera's look. Call render() instead of renderer.render(scene, camera).
 */
export class RealityCompositor {
  look: CameraLook = { ...neutralLook };
  exposure = 1;
  mirror = false;
  private frame: WebGLRenderTarget; private mask: WebGLRenderTarget;
  private quad: Mesh; private screen = new Scene(); private ortho = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private material: ShaderMaterial; private size = new Vector2();
  private renderer: WebGLRenderer;
  constructor(renderer: WebGLRenderer) {
    this.renderer = renderer;
    this.frame = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: 4 });
    // linear: the camera backdrop decodes to linear here; the composite re-encodes it exactly once
    this.frame.texture.colorSpace = LinearSRGBColorSpace;
    this.mask = new WebGLRenderTarget(1, 1, { samples: 2 });
    this.material = new ShaderMaterial({
      uniforms: {
        frame: { value: this.frame.texture }, mask: { value: this.mask.texture }, texel: { value: new Vector2() },
        exposure: { value: 1 }, black: { value: 0 }, white: { value: 1 }, grain: { value: 0 }, soft: { value: 0 },
        saturation: { value: 1 }, time: { value: 0 }, mirror: { value: 0 },
      },
      vertexShader: COMPOSITE_VERTEX, fragmentShader: COMPOSITE_FRAGMENT, depthTest: false, depthWrite: false,
    });
    this.quad = new Mesh(new PlaneGeometry(2, 2), this.material); this.quad.frustumCulled = false;
    this.screen.add(this.quad);
  }
  private fit(width: number, height: number) {
    if (this.frame.width !== width || this.frame.height !== height) {
      this.frame.setSize(width, height); this.mask.setSize(Math.max(1, width >> 1), Math.max(1, height >> 1));
      (this.material.uniforms.texel.value as Vector2).set(1 / width, 1 / height);
    }
  }
  /**
   * backdrop: the camera-picture objects (hidden for the mask pass). hideForMask: anything else that is not
   * jewellery (contact shadows). The renderer's own tone mapping is bypassed; the composite applies it.
   */
  render(scene: Scene, camera: Camera, backdrop: Object3D[], hideForMask: Object3D[] = [], target: WebGLRenderTarget | null = null) {
    const r = this.renderer;
    r.getDrawingBufferSize(this.size);
    const w = target ? target.width : this.size.x, h = target ? target.height : this.size.y;
    this.fit(w, h);
    const clear = r.getClearAlpha();
    r.setRenderTarget(this.frame); r.render(scene, camera);
    const shown = [...backdrop, ...hideForMask].map(o => o.visible);
    [...backdrop, ...hideForMask].forEach(o => (o.visible = false));
    const bg = scene.background; scene.background = null;
    r.setClearAlpha(0); r.setRenderTarget(this.mask); r.clear(); r.render(scene, camera);
    [...backdrop, ...hideForMask].forEach((o, i) => (o.visible = shown[i]));
    scene.background = bg; r.setClearAlpha(clear);
    const u = this.material.uniforms;
    u.exposure.value = this.exposure; u.black.value = this.look.black; u.white.value = this.look.white;
    u.grain.value = this.look.grain; u.soft.value = this.look.soft; u.saturation.value = this.look.saturation;
    u.time.value = (performance.now() / 1000) % 97; u.mirror.value = this.mirror ? 1 : 0;
    r.setRenderTarget(target); r.render(this.screen, this.ortho);
  }
  dispose() { this.frame.dispose(); this.mask.dispose(); this.material.dispose(); this.quad.geometry.dispose(); }
}

/**
 * The saved photo: render at the camera's resolution several times with sub-pixel jitter and average the frames
 * (supersampling), then return a JPEG. draw(target) must render one frame into the given target.
 */
export async function supersampledPhoto(renderer: WebGLRenderer, camera: Camera & { setViewOffset?: (...a: number[]) => void; clearViewOffset?: () => void },
  width: number, height: number, draw: (target: WebGLRenderTarget) => void, samples = 8, mirror = false): Promise<Blob | null> {
  const target = new WebGLRenderTarget(width, height);
  const sum = new Float32Array(width * height * 4), px = new Uint8Array(width * height * 4);
  const jitter = [[0.5, 0.5], [0.25, 0.75], [0.75, 0.25], [0.125, 0.375], [0.625, 0.875], [0.375, 0.125], [0.875, 0.625], [0.0625, 0.5625]];
  for (let s = 0; s < samples; s++) {
    const [jx, jy] = jitter[s % jitter.length];
    camera.setViewOffset?.(width, height, jx - 0.5, jy - 0.5, width, height);
    draw(target);
    renderer.readRenderTargetPixels(target, 0, 0, width, height, px);
    for (let i = 0; i < px.length; i++) sum[i] += px[i];
  }
  camera.clearViewOffset?.();
  target.dispose();
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d')!; const img = ctx.createImageData(width, height);
  // render targets are bottom-up; flip rows (and mirror for a selfie picture)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const from = 4 * ((height - 1 - y) * width + (mirror ? width - 1 - x : x)), to = 4 * (y * width + x);
    img.data[to] = sum[from] / samples; img.data[to + 1] = sum[from + 1] / samples; img.data[to + 2] = sum[from + 2] / samples; img.data[to + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return new Promise(done => canvas.toBlob(done, 'image/jpeg', 0.94));
}
