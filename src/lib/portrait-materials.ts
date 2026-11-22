// Materials for the portrait twin: skin, lips, eyes, teeth, tongue.
//
// Skin: physically based in the boutique's HDR light, plus what makes skin not plastic:
//  - subsurface light: wrapped diffuse that bleeds warm red into the terminator, and transmission where the head is
//    thin and backlit (ears, nostril wings) from a thickness estimate in the shader;
//  - pores and fine creases: the tileable skin-detail texture, triplanar at two scales, as micro normals and as
//    roughness and albedo variation, never one flat colour or one flat gloss;
//  - a tonal map from the scan (forehead, cheeks, nose, jaw, lips): regional tone, not one tint;
//  - the lip zones (UV distance field): the vermillion border, upper and lower lip as their own zone with their own
//    colour variation and moisture, and the uniforms a lipstick will drive (colour, amount, gloss/matte);
//  - stubble: a density sampled from the scan, drawn as fine dark dots over beard regions only;
//  - the portrait fade into shadow below the chest (hair covers the top of the head now).
import { Color, Matrix4, MeshPhysicalMaterial, Vector3, Vector4, type Texture } from 'three';

export type ToneMap = { base: string; forehead?: string; cheeks?: string; nose?: string; jaw?: string; lips?: string };
export type Lipstick = { color: string; amount: number; gloss: number };   // amount 0 = bare lips; gloss 0 matte .. 1 glossy

export function portraitSkinV2(o: {
  tones: ToneMap; env: Texture | null; detail?: Texture | null; lipZones?: Texture | null; lipRect?: [number, number, number, number];
  lipRangeMm?: number; anchors: { eyeY: number; noseY: number; mouthY: number; chinY: number; chestY: number }; stubble?: number;
}) {
  const c = (h?: string) => new Color(h ?? o.tones.base);
  const m = new MeshPhysicalMaterial({
    color: c(), roughness: 0.48, metalness: 0, ior: 1.4, specularIntensity: 0.55,
    sheen: 0.25, sheenRoughness: 0.55, sheenColor: c().lerp(new Color('#ffffff'), 0.5),
    clearcoat: 0.12, clearcoatRoughness: 0.42, envMap: o.env, envMapIntensity: 0.35, transparent: true,
  });
  const U = {
    uTone: { value: c() }, uForehead: { value: c(o.tones.forehead) }, uCheeks: { value: c(o.tones.cheeks) }, uNose: { value: c(o.tones.nose) },
    uJaw: { value: c(o.tones.jaw) }, uLipTone: { value: o.tones.lips ? c(o.tones.lips) : c().multiply(new Color('#e8a0a0')) },
    uY: { value: new Vector4(o.anchors.eyeY, o.anchors.noseY, o.anchors.mouthY, o.anchors.chinY) }, uChest: { value: o.anchors.chestY },
    uDetail: { value: o.detail ?? null }, uDetailOn: { value: o.detail ? 1 : 0 },
    uLips: { value: o.lipZones ?? null }, uLipsOn: { value: o.lipZones ? 1 : 0 }, uLipRect: { value: new Vector4(...(o.lipRect ?? [0, 0, 1, 1])) },
    uLipRange: { value: o.lipRangeMm ?? 6 },
    uLipstick: { value: new Color('#9b1b30') }, uLipstickAmount: { value: 0 }, uLipstickGloss: { value: 0.5 },
    uStubble: { value: o.stubble ?? 0 },
    uToHead: { value: new Matrix4() },            // world -> the head's own frame in mm (set every frame: the head moves)
    uSSS: { value: new Vector3(1.0, 0.32, 0.18) }, uSSSAmt: { value: 0.55 },
    uPhotoOn: { value: 0 },                       // per-vertex photo colour from the scan (attribute aPhoto: rgb + confidence)
    uBrow: { value: Array.from({ length: 10 }, () => new Vector3(0, -1e4, 0)) }, uBrowOn: { value: 0 },   // brow centrelines, a soft tint under the hairs
    uHair: { value: new Vector4(1e4, 0, -1e4, 0) }, uHairColor: { value: new Color('#2b1d14') },   // scalp under the hair: (front hairline y, eye z, nape y, on)
  };
  m.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, U);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vP; varying vec3 vN; varying vec2 vUv2; varying vec4 vPhoto; uniform mat4 uToHead; uniform float uPhotoOn;\n#ifdef USE_PHOTO\nattribute vec4 aPhoto;\n#endif')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvP = (uToHead * modelMatrix * vec4(transformed, 1.0)).xyz; vN = normalize(mat3(uToHead * modelMatrix) * objectNormal); vUv2 = uv;\n#ifdef USE_PHOTO\nvPhoto = aPhoto;\n#else\nvPhoto = vec4(0.0);\n#endif');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vP; varying vec3 vN; varying vec2 vUv2; varying vec4 vPhoto; uniform float uPhotoOn; uniform vec4 uHair; uniform vec3 uHairColor; uniform vec3 uBrow[10]; uniform float uBrowOn;
        uniform vec3 uTone, uForehead, uCheeks, uNose, uJaw, uLipTone, uLipstick, uSSS;
        uniform vec4 uY, uLipRect; uniform float uChest, uDetailOn, uLipsOn, uLipRange, uLipstickAmount, uLipstickGloss, uStubble, uSSSAmt;
        uniform sampler2D uDetail, uLips;
        float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        vec3 tri(vec3 p, vec3 n, float scale) {
          vec3 w = pow(abs(n), vec3(4.0)); w /= dot(w, vec3(1.0)); vec3 q = p / scale;
          return texture2D(uDetail, q.yz).rgb * w.x + texture2D(uDetail, q.xz).rgb * w.y + texture2D(uDetail, q.xy).rgb * w.z;
        }
        // the lip zones: x = signed mm to the vermillion border (+ on the lips), y = signed mm to where the lips meet (+ upper)
        vec2 lipField() {
          if (uLipsOn < 0.5) return vec2(-99.0);
          vec2 t = vec2((vUv2.x - uLipRect.x) / (uLipRect.z - uLipRect.x), ((1.0 - vUv2.y) - uLipRect.y) / (uLipRect.w - uLipRect.y));
          if (t.x < 0.0 || t.y < 0.0 || t.x > 1.0 || t.y > 1.0) return vec2(-99.0);
          vec2 s = texture2D(uLips, t).rg; return (s * 255.0 - 128.0) / 127.0 * uLipRange;
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        // regional tone: forehead above the eyes, nose around the midline between eyes and mouth, cheeks, jaw below the mouth
        float ax = abs(vP.x);
        vec3 tone = uTone;
        tone = mix(tone, uForehead, smoothstep(uY.x + 8.0, uY.x + 28.0, vP.y));
        tone = mix(tone, uCheeks, (1.0 - smoothstep(18.0, 40.0, abs(ax - 38.0))) * smoothstep(uY.z - 5.0, uY.z + 15.0, vP.y) * (1.0 - smoothstep(uY.x - 5.0, uY.x + 5.0, vP.y)));
        tone = mix(tone, uNose, (1.0 - smoothstep(9.0, 16.0, ax)) * smoothstep(uY.y - 10.0, uY.y, vP.y) * (1.0 - smoothstep(uY.x - 2.0, uY.x + 8.0, vP.y)));
        tone = mix(tone, uJaw, 1.0 - smoothstep(uY.w - 5.0, uY.z - 2.0, vP.y));
        vec3 dA = uDetailOn > 0.5 ? mix(tri(vP, vN, 9.3), tri(vP + 3.7, vN, 23.0), 0.4) : vec3(0.5);
        diffuseColor.rgb = tone * (0.93 + 0.14 * dA.b);
        // the scan's own colour where the photo saw this skin squarely: its chroma and local variation (freckles,
        // flush, under-eye), with the photo's lighting taken out by matching its brightness to the tone map
        if (uPhotoOn > 0.5 && vPhoto.a > 0.01) {
          vec3 pc = vPhoto.rgb; const vec3 Y = vec3(0.2126, 0.7152, 0.0722);
          vec3 albedo = pc * dot(diffuseColor.rgb, Y) / max(dot(pc, Y), 1e-3);
          diffuseColor.rgb = mix(diffuseColor.rgb, albedo, 0.8 * vPhoto.a);
        }
        // scalp under the hair takes the hair's colour, so no bald skin shows between strands
        if (uHair.w > 0.5) {
          float front = smoothstep(uHair.y - 30.0, uHair.y - 20.0, vP.z);
          float line = mix(uHair.z, uHair.x, front);
          diffuseColor.rgb = mix(diffuseColor.rgb, uHairColor * 0.55, smoothstep(line - 2.0, line + 6.0, vP.y) * 0.92);
        }
        // brows: the skin beneath them shaded toward the hair colour (real brows read as a soft tone, not only as hairs)
        if (uBrowOn > 0.0) {
          float bm = 0.0;
          for (int b = 0; b < 2; b++) for (int k = 0; k < 4; k++) {
            vec3 A = uBrow[b * 5 + k], B = uBrow[b * 5 + k + 1], AB = B - A;
            float h = clamp(dot(vP - A, AB) / dot(AB, AB), 0.0, 1.0), u = (float(k) + h) / 4.0;
            float w = mix(4.6, 1.6, u * u);                                  // full at the head, thin at the tail
            bm = max(bm, 1.0 - smoothstep(w * 0.45, w, length(vP - A - AB * h)));
          }
          float grain = 0.75 + 0.25 * fract(sin(dot(floor(vP.xy * 4.0), vec2(12.9898, 78.233))) * 43758.5453);
          diffuseColor.rgb = mix(diffuseColor.rgb, uHairColor * 0.8, bm * uBrowOn * grain);
        }
        // lips: their own colour with a darker, redder centre line and fine vertical texture; the border is sharp
        vec2 lf = lipField();
        float lip = smoothstep(-0.18, 0.18, lf.x);
        float lipTexture = 0.94 + 0.12 * fract(sin(dot(floor(vec2(vP.x * 1.6, vP.y * 0.4)), vec2(12.9898, 78.233))) * 43758.5453);
        vec3 lipCol = uLipTone * mix(1.0, 0.82, exp(-abs(lf.y) * 0.9)) * lipTexture;
        lipCol = mix(lipCol, uLipstick, clamp(uLipstickAmount, 0.0, 1.0) * smoothstep(-0.12, 0.12, lf.x));
        diffuseColor.rgb = mix(diffuseColor.rgb, lipCol, lip);
        // stubble: fine dark dots over the beard and moustache, never on the lips
        float beard = (1.0 - smoothstep(uY.y - 4.0, uY.y + 6.0, vP.y)) * smoothstep(uY.w - 30.0, uY.w - 10.0, vP.y) * (1.0 - smoothstep(55.0, 70.0, ax));
        float dots = step(0.62, hash(floor(vP * 3.2)));
        diffuseColor.rgb *= 1.0 - uStubble * beard * (1.0 - lip) * (0.18 + 0.42 * dots);
        // the portrait fade below the chest
        // a soft oval vignette: the chest and shoulders melt into the background, no cut edge and no corners
        { float dy = max(0.0, uChest + 40.0 - vP.y) / 45.0, dx = max(0.0, ax - 95.0) / 80.0;
          diffuseColor.a *= 1.0 - smoothstep(0.55, 1.0, length(vec2(dx, dy))); }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + (dA.r - 0.5) * 0.24, 0.3, 0.72);
        // the T-zone a little shinier, lips moist (or the lipstick's finish)
        roughnessFactor -= 0.06 * (1.0 - smoothstep(9.0, 22.0, ax)) * smoothstep(uY.y - 10.0, uY.x + 30.0, vP.y);
        roughnessFactor = mix(roughnessFactor, mix(0.32, mix(0.62, 0.12, uLipstickGloss), uLipstickAmount), lip);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        if (uDetailOn > 0.5) {                        // pores and fine creases as micro normals
          float e = 0.35; vec3 g = vec3(tri(vP + vec3(e,0,0), vN, 9.3).r - tri(vP - vec3(e,0,0), vN, 9.3).r,
                                        tri(vP + vec3(0,e,0), vN, 9.3).r - tri(vP - vec3(0,e,0), vN, 9.3).r,
                                        tri(vP + vec3(0,0,e), vN, 9.3).r - tri(vP - vec3(0,0,e), vN, 9.3).r);
          normal = normalize(normal - (viewMatrix * vec4(g, 0.0)).xyz * 0.55 * (1.0 - lip * 0.6));
        }`)
      .replace('#include <opaque_fragment>', `
        // subsurface: light bleeds past the terminator in warm red; thin backlit parts (ears, nostril wings) glow
        vec3 Nw = normalize(vN), Lw = normalize(vec3(-0.35, 0.65, 0.65));
        float ndl = dot(Nw, Lw), wrap = clamp((ndl + 0.5) / 1.5, 0.0, 1.0) - clamp(ndl, 0.0, 1.0);
        float thin = smoothstep(55.0, 75.0, ax) * (1.0 - smoothstep(-10.0, 25.0, vP.z - 0.0)) + (1.0 - smoothstep(10.0, 20.0, ax)) * smoothstep(uY.y - 6.0, uY.y + 2.0, vP.y) * (1.0 - smoothstep(uY.y + 4.0, uY.y + 14.0, vP.y)) * 0.5;
        float back = pow(clamp(dot(normalize(-vViewPosition), -normalize((viewMatrix * vec4(Lw, 0.0)).xyz)), 0.0, 1.0), 3.0);
        outgoingLight += diffuseColor.rgb * uSSS * uSSSAmt * (0.22 * max(wrap, 0.0) + 0.35 * thin * (0.35 + back));
        #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'ames-portrait-skin-v2' + (m.defines?.USE_PHOTO ? '-photo' : '');
  return {
    usePhoto: (on: boolean) => { m.defines = { ...(m.defines ?? {}), ...(on ? { USE_PHOTO: '' } : {}) }; if (!on && m.defines) delete m.defines.USE_PHOTO; U.uPhotoOn.value = on ? 1 : 0; m.needsUpdate = true; }, material: m, uniforms: U, setLipstick: (l: Lipstick | null) => { U.uLipstickAmount.value = l ? l.amount : 0; if (l) { U.uLipstick.value.set(l.color); U.uLipstickGloss.value = l.gloss; } },
    setTones: (t: ToneMap) => { U.uTone.value.set(t.base); U.uForehead.value.set(t.forehead ?? t.base); U.uCheeks.value.set(t.cheeks ?? t.base); U.uNose.value.set(t.nose ?? t.base);
      U.uJaw.value.set(t.jaw ?? t.base); U.uLipTone.value.set(t.lips ?? t.base).multiply(t.lips ? new Color('#ffffff') : new Color('#e8a0a0')); m.sheenColor.set(t.base).lerp(new Color('#ffffff'), 0.5); } };
}

/** Living eyes: a procedural iris (fibres, a darker limbal ring, collarette, pupil), a wet cornea bulge with sharp
 *  catchlights from the HDR studio, and a sclera that is not paper white. Works on the eye meshes' own direction:
 *  the eye's forward axis is found from its geometry (+z out of the face). */
export function portraitEye(o: { env: Texture | null; iris: string; centre: Vector3; radius: number }) {
  const m = new MeshPhysicalMaterial({ roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.02, envMap: o.env, envMapIntensity: 0.9, ior: 1.376, specularIntensity: 1 });
  const U = { uIris: { value: new Color(o.iris) }, uC: { value: o.centre.clone() }, uR: { value: o.radius } };
  m.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, U);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vE;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvE = transformed;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vE; uniform vec3 uIris, uC; uniform float uR;\nfloat h1(float n){return fract(sin(n)*43758.5453);}')
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 d = normalize(vE - uC);                       // direction from the eye's centre; +z looks out
        float a = acos(clamp(d.z, -1.0, 1.0));            // angle from the line of sight
        float ang = atan(d.y, d.x);
        float irisA = 0.42, pupilA = 0.16;
        float fib = 0.75 + 0.25 * sin(ang * 70.0 + h1(floor(ang * 11.0)) * 6.0) * (0.6 + 0.4 * sin(a * 40.0));
        vec3 iris = uIris * fib * mix(1.25, 0.8, smoothstep(pupilA, irisA, a));
        iris = mix(iris, uIris * 1.5 + 0.05, smoothstep(0.02, 0.0, abs(a - pupilA * 1.55)) * 0.35);   // the collarette
        iris *= mix(1.0, 0.35, smoothstep(irisA - 0.08, irisA, a));                                      // the limbal ring
        vec3 sclera = vec3(0.93, 0.9, 0.87) * mix(1.0, 0.86, smoothstep(0.9, 1.6, a));                  // whiter centre, shadowed toward the lids
        sclera = mix(sclera, vec3(0.9, 0.62, 0.6), 0.12 * smoothstep(1.1, 1.5, a) * (0.5 + 0.5 * sin(ang * 23.0)));  // faint vessels
        vec3 col = mix(iris, sclera, smoothstep(irisA - 0.01, irisA + 0.025, a));
        col = mix(vec3(0.012), col, smoothstep(pupilA - 0.015, pupilA + 0.01, a));                      // the pupil
        diffuseColor.rgb = col;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(0.08, 0.22, smoothstep(0.4, 0.6, acos(clamp(normalize(vE - uC).z, -1.0, 1.0))));`);
  };
  m.customProgramCacheKey = () => 'ames-portrait-eye';
  return m;
}

export function teethMaterial(env: Texture | null) {
  return new MeshPhysicalMaterial({ color: '#efe6d6', roughness: 0.28, clearcoat: 0.6, clearcoatRoughness: 0.15, envMap: env, envMapIntensity: 0.4, sheen: 0.2, sheenColor: new Color('#fff6e8') });
}
export function tongueMaterial(env: Texture | null) {
  return new MeshPhysicalMaterial({ color: '#b5545c', roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.2, envMap: env, envMapIntensity: 0.25 });
}
