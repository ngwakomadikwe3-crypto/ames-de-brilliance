// The customer's own skin on the twin: the scan photos projected onto the head's UV map.
//
// Every texel of the skin's UV map knows where it lies on the fitted head (mm). Each scan frame's fitted pose takes that
// point into the photo, so the texel can read the customer's real skin there: pores, freckles, moles, complexion.
//  - Confidence per frame: how squarely the photo sees the point (feathered to nothing at the silhouette), whether it
//    is visible at all (a depth map of the head from that frame's camera: the nose hides part of the far cheek), the
//    photo's edges, and never the eyes' openings (a millimetre of misfit there would paint eye white on the lids).
//  - Frames are blended by confidence, the front frame favoured. Points no frame sees well take the mirror image of
//    the other side of the face; what remains (back of the head, under the chin) has no photo and the twin's own
//    tone and pore detail show there.
//  - De-lit: the photo's large-scale shading (the room's light falling across the face) is divided out using a
//    blurred copy of the photo, so the map keeps detail and complexion but not the shadows of that room; the twin is
//    lit by the jewellery studio instead.
// The result is a colour ratio to the customer's average skin colour (1 = exactly the average), so the twin's tone
// (sampled in LAB, adjustable, harmonised with the hands) multiplies into it: never a flat fill, never a second tone.
import {
  BufferAttribute, BufferGeometry, Camera, Matrix3, Vector2, DataTexture, FloatType, GLSL3, HalfFloatType, LinearFilter, LinearMipmapLinearFilter, Mesh,
  NearestFilter, RGBAFormat, Scene, ShaderMaterial, UnsignedByteType, Vector3, WebGLRenderer, WebGLRenderTarget, DoubleSide,
} from 'three';
import type { P3 } from './face-morph';
import type { Pose } from './portrait-fit';

export type BakeView = { img: { data: Uint8ClampedArray; width: number; height: number }; pose: Pose; favour?: number;
  oval: [number, number][] };   // the face's outline in this photo (MediaPipe face oval, pixels): nothing outside it is the face
export type BakeInput = {
  points: P3[]; normals: P3[]; uv: ArrayLike<number>; index: ArrayLike<number>;
  views: BakeView[];                     // up to 4 (front first)
  tone: number[];                        // the customer's average skin colour, linear RGB 0..1
  eyes: P3[][];                          // the eye-opening contours (mm), kept out of the bake
  size?: number;
};
export type SkinMap = { map: string; conf: string; coverage: number };

const MAX_VIEWS = 4, OVAL = 36;
/** MediaPipe's face-oval landmarks, in order round the face. */
export const FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];

/** Bake the skin map. Returns a JPEG of the colour ratio (x0.5) and a small greyscale JPEG of the confidence. */
export function bakeSkinMap(input: BakeInput, renderer?: WebGLRenderer): SkinMap {
  const size = input.size ?? 1024, own = !renderer;
  const r = renderer ?? new WebGLRenderer({ antialias: false, preserveDrawingBuffer: false });
  const views = input.views.slice(0, MAX_VIEWS), n = input.points.length;
  const geo = new BufferGeometry();
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), UV = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { P.set(input.points[i], i * 3); N.set(input.normals[i], i * 3); UV.set([input.uv[i * 2], input.uv[i * 2 + 1], 0], i * 3); }
  geo.setAttribute('position', new BufferAttribute(UV, 3)); geo.setAttribute('aP', new BufferAttribute(P, 3)); geo.setAttribute('aN', new BufferAttribute(N, 3));
  geo.setIndex(new BufferAttribute(Uint32Array.from(input.index), 1));
  const cam = new Camera(), disposables: { dispose(): void }[] = [geo];
  const floatOk = r.extensions.has('EXT_color_buffer_float');

  // 1. per view: the photo (mipmapped, for the de-lighting blur) and a depth map of the head seen from that camera
  const photos: DataTexture[] = [], depths: WebGLRenderTarget[] = [];
  for (const v of views) {
    const t = new DataTexture(new Uint8Array(v.img.data.buffer.slice(0)), v.img.width, v.img.height, RGBAFormat, UnsignedByteType);
    t.flipY = false; t.generateMipmaps = true; t.minFilter = LinearMipmapLinearFilter; t.magFilter = LinearFilter; t.needsUpdate = true;
    photos.push(t); disposables.push(t);
    const dw = 512, dh = Math.round(512 * v.img.height / v.img.width);
    const rt = new WebGLRenderTarget(dw, dh, { type: floatOk ? FloatType : HalfFloatType, minFilter: NearestFilter, magFilter: NearestFilter, depthBuffer: true });
    disposables.push(rt);
    const zs = input.points.map(p => poseZ(v.pose, p)), zMin = Math.min(...zs) - 10, zMax = Math.max(...zs) + 10;
    const m = new ShaderMaterial({
      glslVersion: GLSL3, side: DoubleSide,
      uniforms: { uR: { value: rows(v.pose) }, uS: { value: v.pose.s }, uT: { value: new Vector3(...v.pose.t) }, uWH: { value: [v.img.width, v.img.height] }, uZ: { value: [zMin, zMax] } },
      vertexShader: `in vec3 aP; uniform mat3 uR; uniform float uS; uniform vec3 uT; uniform vec2 uWH, uZ; out float vZ;
        void main() { vec3 q = uS * (uR * aP) + uT; vZ = q.z;
          gl_Position = vec4(q.x / uWH.x * 2.0 - 1.0, 1.0 + 2.0 * q.y / uWH.y, 1.0 - 2.0 * (q.z - uZ.x) / (uZ.y - uZ.x), 1.0); }`,
      fragmentShader: `in float vZ; out vec4 o; void main() { o = vec4(vZ, 0.0, 0.0, 1.0); }`,
    });
    disposables.push(m);
    const scene = new Scene(); scene.add(new Mesh(geo, m));
    r.setRenderTarget(rt); r.setClearColor(0x000000, 0); r.clear(); r.render(scene, cam);
    depths.push(rt);
  }

  // 2. the bake, in UV space
  const eyePts: Vector3[] = []; for (const c of input.eyes) for (const p of c.slice(0, 16)) eyePts.push(new Vector3(...p));
  while (eyePts.length < 32) eyePts.push(new Vector3(0, 1e5, 0));
  const pad = <T,>(a: T[], fill: T) => { const o = a.slice(); while (o.length < MAX_VIEWS) o.push(fill); return o; };
  const bake = new ShaderMaterial({
    glslVersion: GLSL3, side: DoubleSide,
    defines: { VIEWS: views.length },
    uniforms: {
      uPhoto: { value: pad(photos, photos[0]) }, uDepth: { value: pad(depths.map(d => d.texture), depths[0].texture) },
      uR: { value: pad(views.map(v => rows(v.pose)), rows(views[0].pose)) }, uS: { value: pad(views.map(v => v.pose.s), 1) },
      uT: { value: pad(views.map(v => new Vector3(...v.pose.t)), new Vector3()) },
      uWH: { value: pad(views.map(v => new Vector3(v.img.width, v.img.height, 0)), new Vector3(1, 1, 0)) },
      uFavour: { value: pad(views.map(v => v.favour ?? 1), 0) },
      uOval: { value: pad(views, views[0]).flatMap(v => v.oval.slice(0, OVAL).map(([x, y]) => new Vector2(x, y))) },
      uFeather: { value: pad(views.map(v => 0.05 * Math.hypot(v.oval[8][0] - v.oval[28][0], v.oval[8][1] - v.oval[28][1])), 1) },
      uTone: { value: new Vector3(...input.tone) }, uEye: { value: eyePts },
    },
    vertexShader: `in vec3 aP; in vec3 aN; out vec3 vP; out vec3 vN;
      void main() { vP = aP; vN = aN; gl_Position = vec4(position.xy * 2.0 - 1.0, 0.0, 1.0); }`,
    fragmentShader: `precision highp float;
      in vec3 vP; in vec3 vN; out vec4 o;
      uniform sampler2D uPhoto[${MAX_VIEWS}]; uniform sampler2D uDepth[${MAX_VIEWS}];
      uniform mat3 uR[${MAX_VIEWS}]; uniform float uS[${MAX_VIEWS}]; uniform vec3 uT[${MAX_VIEWS}]; uniform vec3 uWH[${MAX_VIEWS}]; uniform float uFavour[${MAX_VIEWS}];
      uniform vec3 uTone; uniform vec3 uEye[32]; uniform vec2 uOval[${MAX_VIEWS * 36}]; uniform float uFeather[${MAX_VIEWS}];
      // how far inside the face outline of view k a photo pixel is (pixels; negative outside)
      float insideOval(int k, vec2 px) {
        float d = 1e9; bool inside = false;
        for (int i = 0; i < 36; i++) { vec2 a = uOval[k * 36 + i], b = uOval[k * 36 + (i + 1) % 36], ab = b - a;
          float t = clamp(dot(px - a, ab) / dot(ab, ab), 0.0, 1.0); d = min(d, length(px - a - ab * t));
          if ((a.y > px.y) != (b.y > px.y) && px.x < a.x + (px.y - a.y) / (b.y - a.y) * (b.x - a.x)) inside = !inside; }
        return inside ? d : -d;
      }
      vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }
      float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
      // the colour ratio and confidence of one view at a point (p, n in head mm)
      // (samplers passed in by constant index: GLSL ES 3 cannot index sampler arrays with a loop variable)
      void look(sampler2D photo, sampler2D depth, int k, vec3 p, vec3 n, inout vec3 acc, inout float wsum) {
        vec3 q = uS[k] * (uR[k] * p) + uT[k];
        vec2 uv = vec2(q.x / uWH[k].x, -q.y / uWH[k].y);
        if (uv.x < 0.01 || uv.y < 0.01 || uv.x > 0.99 || uv.y > 0.99) return;
        float facing = (uR[k] * n).z;
        float w = smoothstep(0.22, 0.62, facing);
        if (w <= 0.0) return;
        float dz = texture(depth, vec2(uv.x, 1.0 - uv.y)).r - q.z;
        w *= 1.0 - smoothstep(3.0, 6.0, dz / uS[k]);                    // hidden behind the nose or the cheek: not this view
        // and nowhere near the photo's edges, and only inside the face's own outline (the photo's background, hair and
        // neck never come onto the skin), feathered
        w *= smoothstep(0.01, 0.05, min(min(uv.x, uv.y), min(1.0 - uv.x, 1.0 - uv.y)));
        w *= smoothstep(0.0, uFeather[k], insideOval(k, vec2(q.x, -q.y)));
        if (w <= 0.0) return;
        vec3 c = lin(texture(photo, uv).rgb);
        // de-light: the large-scale shading of the room, from a blurred copy (mip level ~ 8 mm on the face)
        float lod = log2(max(1.0, 8.0 * uS[k]));
        float shade = lum(lin(textureLod(photo, uv, lod).rgb)) / max(1e-3, lum(uTone));
        vec3 rel = c / max(vec3(1e-3), uTone * shade);
        // skin keeps skin's hue: a sample whose colour is far from the customer's own (the room behind them, a
        // misaligned edge) is not skin, whatever the outline says. Freckles, moles, brows and flush pass.
        float m3 = max(1e-3, (rel.r + rel.g + rel.b) / 3.0), dev = length(rel / m3 - 1.0);
        w *= 1.0 - smoothstep(0.32, 0.5, dev * smoothstep(0.25, 0.5, m3));
        w *= uFavour[k] * w;                                            // squarer views count much more
        acc += w * clamp(rel, 0.0, 2.0); wsum += w;
      }
      void main() {
        vec3 n = normalize(vN);
        float eye = 1e9;
        for (int i = 0; i < 32; i++) eye = min(eye, length(vP - uEye[i]));
        float keep = smoothstep(2.0, 4.5, eye);
        vec3 acc = vec3(0.0); float wsum = 0.0;
        #define LOOK(K, P, N, A, W) if (K < VIEWS) look(uPhoto[K], uDepth[K], K, P, N, A, W);
        LOOK(0, vP, n, acc, wsum) LOOK(1, vP, n, acc, wsum) LOOK(2, vP, n, acc, wsum) LOOK(3, vP, n, acc, wsum)
        vec3 mAcc = vec3(0.0); float mSum = 0.0;                          // the mirror image of the other side of the face
        vec3 pm = vec3(-vP.x, vP.yz), nm = vec3(-n.x, n.yz);
        LOOK(0, pm, nm, mAcc, mSum) LOOK(1, pm, nm, mAcc, mSum) LOOK(2, pm, nm, mAcc, mSum) LOOK(3, pm, nm, mAcc, mSum)
        float direct = clamp(wsum * 2.0, 0.0, 1.0), mirror = clamp(mSum * 2.0, 0.0, 1.0) * 0.85;
        vec3 col = direct > 0.0 ? acc / max(wsum, 1e-4) : vec3(1.0);
        vec3 colM = mSum > 0.0 ? mAcc / max(mSum, 1e-4) : vec3(1.0);
        vec3 rel = mix(colM, col, direct / max(1e-4, max(direct, mirror)));
        float conf = max(direct, mirror) * keep;
        o = vec4(rel * 0.5, conf);
      }`,
  });
  disposables.push(bake);
  const target = new WebGLRenderTarget(size, size, { type: UnsignedByteType, depthBuffer: false });
  disposables.push(target);
  const scene = new Scene(); scene.add(new Mesh(geo, bake));
  r.setRenderTarget(target); r.setClearColor(0x000000, 0); r.clear(); r.render(scene, cam); r.setRenderTarget(null);
  const px = new Uint8Array(size * size * 4); r.readRenderTargetPixels(target, 0, 0, size, size, px);
  disposables.forEach(d => d.dispose()); if (own) r.dispose();
  dilate(px, size, 6);
  let covered = 0; for (let i = 3; i < px.length; i += 4) if (px[i] > 128) covered++;
  return { ...encode(px, size), coverage: covered / (size * size) };
}

const poseZ = (p: Pose, x: P3) => p.s * (p.R[2][0] * x[0] + p.R[2][1] * x[1] + p.R[2][2] * x[2]) + p.t[2];
const rows = (p: Pose) => new Matrix3().set(p.R[0][0], p.R[0][1], p.R[0][2], p.R[1][0], p.R[1][1], p.R[1][2], p.R[2][0], p.R[2][1], p.R[2][2]);

/** Spread colour into empty texels at UV island edges, so filtering never pulls in black at the seams. */
function dilate(px: Uint8Array, size: number, passes: number) {
  for (let pass = 0; pass < passes; pass++) {
    const src = px.slice();
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4; if (src[i + 3] || src[i] || src[i + 1]) continue;
      let r = 0, g = 0, b = 0, a = 0, c = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= size || yy >= size) continue;
        const j = (yy * size + xx) * 4; if (!(src[j] || src[j + 1] || src[j + 2])) continue;
        r += src[j]; g += src[j + 1]; b += src[j + 2]; a += src[j + 3]; c++;
      }
      if (c) { px[i] = r / c; px[i + 1] = g / c; px[i + 2] = b / c; px[i + 3] = a / c; }
    }
  }
}

/** Colour ratio as a JPEG (rows in UV order: row 0 is v = 0, read with flipY off) and confidence as a small JPEG. */
function encode(px: Uint8Array, size: number) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d')!, img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const empty = !(px[i * 4] || px[i * 4 + 1] || px[i * 4 + 2]);
    img.data[i * 4] = empty ? 128 : px[i * 4]; img.data[i * 4 + 1] = empty ? 128 : px[i * 4 + 1]; img.data[i * 4 + 2] = empty ? 128 : px[i * 4 + 2]; img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const map = c.toDataURL('image/jpeg', 0.9);
  const s = 256, k = size / s, c2 = document.createElement('canvas'); c2.width = c2.height = s;
  const ctx2 = c2.getContext('2d')!, img2 = ctx2.createImageData(s, s);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    let a = 0; for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) a += px[((y * k + dy) * size + x * k + dx) * 4 + 3];
    a /= k * k; const o = (y * s + x) * 4; img2.data[o] = img2.data[o + 1] = img2.data[o + 2] = a; img2.data[o + 3] = 255;
  }
  ctx2.putImageData(img2, 0, 0);
  return { map, conf: c2.toDataURL('image/jpeg', 0.92) };
}
