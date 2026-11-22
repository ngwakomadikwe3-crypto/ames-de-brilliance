// Materials for the portrait twin: skin, lips, eyes, teeth, tongue.
//
// Skin: physically based in the boutique's HDR light, plus what makes skin not plastic:
//  - subsurface light: wrapped diffuse that bleeds warm red into the terminator, and transmission where the head is
//    thin and backlit (ears, nostril wings) from a thickness estimate in the shader;
//  - pores and fine creases: the tileable skin-detail texture, triplanar at two scales, as micro normals and as
//    roughness and albedo variation, never one flat colour or one flat gloss;
//  - the customer's own skin: the scan photos projected onto the UV map (skin-bake.ts), multiplied into the tone;
//  - a tonal map from the scan (LAB average with subtle zones: forehead, cheeks, nose, jaw, lips): never one flat tint;
//  - the lip zones (UV distance field): the vermillion border, upper and lower lip as their own zone with their own
//    colour variation and moisture, and the uniforms a lipstick will drive (colour, amount, gloss/matte);
//  - stubble: a density sampled from the scan, drawn as fine dark dots over beard regions only;
//  - the portrait fade into shadow below the chest (hair covers the top of the head now).
import { type Mesh, type Material, Color, Matrix4, MeshPhysicalMaterial, Vector3, Vector4, type Texture } from 'three';

export type ToneMap = { base: string; forehead?: string; cheeks?: string; nose?: string; jaw?: string; lips?: string };
export type Lipstick = { color: string; amount: number; gloss: number };   // amount 0 = bare lips; gloss 0 matte .. 1 glossy

export function portraitSkinV2(o: {
  tones: ToneMap; env: Texture | null; detail?: Texture | null; lipZones?: Texture | null; lipRect?: [number, number, number, number];
  lipRangeMm?: number; anchors: { eyeY: number; noseY: number; mouthY: number; chinY: number; chestY: number }; stubble?: number; lipBox?: Vector4;
}) {
  const c = (h?: string) => new Color(h ?? o.tones.base);
  const m = new MeshPhysicalMaterial({
    color: c(), roughness: 0.55, metalness: 0, ior: 1.4, specularIntensity: 0.7,
    sheen: 0.3, sheenRoughness: 0.55, sheenColor: c().lerp(new Color('#ffffff'), 0.5),
    clearcoat: 0.18, clearcoatRoughness: 0.4, envMap: o.env, envMapIntensity: 0.45, transparent: true,
  });
  const U = {
    uTone: { value: c() }, uForehead: { value: c(o.tones.forehead) }, uCheeks: { value: c(o.tones.cheeks) }, uNose: { value: c(o.tones.nose) },
    uJaw: { value: c(o.tones.jaw) }, uLipTone: { value: o.tones.lips ? c(o.tones.lips) : c().multiply(new Color('#eeb4b0')) },
    uY: { value: new Vector4(o.anchors.eyeY, o.anchors.noseY, o.anchors.mouthY, o.anchors.chinY) }, uChest: { value: o.anchors.chestY },
    uDetail: { value: o.detail ?? null }, uDetailOn: { value: o.detail ? 1 : 0 },
    uLips: { value: o.lipZones ?? null }, uLipsOn: { value: o.lipZones ? 1 : 0 }, uLipRect: { value: new Vector4(...(o.lipRect ?? [0, 0, 1, 1])) },
    uLipRange: { value: o.lipRangeMm ?? 6 }, uLipBox: { value: o.lipBox?.clone() ?? new Vector4(1e4, -1e4, 1e4, -1e4) },   // (half width, bottom, top, back) mm
    uLipstick: { value: new Color('#9b1b30') }, uLipstickAmount: { value: 0 }, uLipstickGloss: { value: 0.5 },
    uStubble: { value: o.stubble ?? 0 },
    uToHead: { value: new Matrix4() },            // world -> the head's own frame in mm (set every frame: the head moves)
    uSSS: { value: new Vector3(1.0, 0.36, 0.22) }, uSSSAmt: { value: 0.85 },
    uSkinMap: { value: null as Texture | null }, uSkinConf: { value: null as Texture | null }, uSkinOn: { value: 0 }, uSkinRect: { value: new Vector4(0, 0, 1, 1) },   // the customer's own skin (skin-bake.ts)
    uBrow: { value: Array.from({ length: 10 }, () => new Vector3(0, -1e4, 0)) }, uBrowOn: { value: 0 },   // brow centrelines, a soft tint under the hairs
    uEar: { value: new Vector3(0, 0, -1e4) },   // (ear top y, ear lobe y, ear z): the hairline round the ears
    uHair: { value: new Vector4(1e4, 0, -1e4, 0) }, uHairColor: { value: new Color('#2b1d14') },   // scalp under the hair: (front hairline y, eye z, nape y, on)
  };
  m.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, U);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vP; varying vec3 vN; varying vec2 vUv2; uniform mat4 uToHead;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvP = (uToHead * modelMatrix * vec4(transformed, 1.0)).xyz; vN = normalize(mat3(uToHead * modelMatrix) * objectNormal); vUv2 = uv;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vP; varying vec3 vN; varying vec2 vUv2; uniform sampler2D uSkinMap, uSkinConf; uniform float uSkinOn; uniform vec4 uSkinRect; uniform vec4 uHair; uniform vec3 uEar; uniform vec3 uHairColor; uniform vec3 uBrow[10]; uniform float uBrowOn;
        uniform vec3 uTone, uForehead, uCheeks, uNose, uJaw, uLipTone, uLipstick, uSSS;
        uniform vec4 uY, uLipRect, uLipBox; uniform float uChest, uDetailOn, uLipsOn, uLipRange, uLipstickAmount, uLipstickGloss, uStubble, uSSSAmt;
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
        // the customer's own skin from the scan photos (a colour ratio to their average skin colour, so the tone above
        // multiplies into it) and how surely the photos saw this spot
        vec3 skinRel = vec3(1.0); float skinConf = 0.0;
        if (uSkinOn > 0.5) { vec2 su = (vUv2 - uSkinRect.xy) / uSkinRect.zw;
          if (all(greaterThan(su, vec2(0.0))) && all(lessThan(su, vec2(1.0)))) { skinRel = texture2D(uSkinMap, su).rgb * 2.0; skinConf = texture2D(uSkinConf, su).r; } }
        float scalp = 0.0;
        // scalp under the hair takes the hair's colour, so no bald skin shows between strands
        if (uHair.w > 0.5) {
          // a natural hairline: the forehead line (dipping a little at the temples), down in front of the ear as a short
          // sideburn, up over the ear, and down behind it to the nape (blended, never a hard step)
          float line;
          if (uEar.z > -1e3) {
            float dz = vP.z - uEar.z, ax2 = abs(vP.x);
            float forehead = uHair.x - 9.0 * smoothstep(30.0, 52.0, ax2);
            float side = mix(uEar.x - 14.0, forehead - 4.0, smoothstep(7.0, 17.0, dz));           // a short sideburn just in front of the ear
            float overEar = uEar.x + 3.0;
            float behind = mix(overEar, uHair.z, smoothstep(-12.0, -38.0, dz));
            line = dz > 5.0 ? side : mix(behind, mix(overEar, side, smoothstep(-6.0, 5.0, dz)), smoothstep(-14.0, -6.0, dz));
            line = mix(line, forehead, smoothstep(17.0, 30.0, dz) * (1.0 - smoothstep(58.0, 72.0, ax2)));
          } else {
            float front = smoothstep(uHair.y - 30.0, uHair.y - 20.0, vP.z);
            line = mix(uHair.z, uHair.x, front);
          }
          // a close crop: fine short hairs (a grain of darker and lighter flecks), the hairline soft
          float crop = 0.78 + 0.44 * fract(sin(dot(floor(vP * 2.2), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
          scalp = smoothstep(line - 3.0, line + 7.0, vP.y);
          diffuseColor.rgb = mix(diffuseColor.rgb, uHairColor * 0.55 * crop, scalp * 0.94);
        }
        // brows: the skin beneath them shaded toward the hair colour (real brows read as a soft tone, not only as hairs)
        if (uBrowOn > 0.0) {
          float bm = 0.0;
          for (int b = 0; b < 2; b++) for (int k = 0; k < 4; k++) {
            vec3 A = uBrow[b * 5 + k], B = uBrow[b * 5 + k + 1], AB = B - A;
            float h = clamp(dot(vP - A, AB) / dot(AB, AB), 0.0, 1.0), u = (float(k) + h) / 4.0;
            float w = mix(3.4, 1.2, u * u);                                  // full at the head, thin at the tail
            bm = max(bm, 1.0 - smoothstep(w * 0.15, w, length(vP - A - AB * h)));   // feathered: a tone, never a painted block
          }
          float grain = 0.75 + 0.25 * fract(sin(dot(floor(vP.xy * 4.0), vec2(12.9898, 78.233))) * 43758.5453);
          diffuseColor.rgb = mix(diffuseColor.rgb, uHairColor * 0.8, bm * uBrowOn * grain * (1.0 - skinConf));   // the photo has the real brows
        }
        // lips: their own colour with a darker, redder centre line and fine vertical texture; the border is sharp
        vec2 lf = lipField();
        // the vermillion: the lip-zone field, and never outside the lips' own box on the face (another UV island can share
        // the lip map's rectangle; the 3D box keeps the tint exactly on the lips)
        float inBox = (1.0 - smoothstep(uLipBox.x - 2.0, uLipBox.x, ax)) * smoothstep(uLipBox.y, uLipBox.y + 2.0, vP.y) * (1.0 - smoothstep(uLipBox.z - 2.0, uLipBox.z, vP.y)) * step(uLipBox.w, vP.z);
        float lip = smoothstep(-0.25, 0.25, lf.x) * inBox;
        float lipTexture = 0.94 + 0.12 * fract(sin(dot(floor(vec2(vP.x * 1.6, vP.y * 0.4)), vec2(12.9898, 78.233))) * 43758.5453);
        // bare lips: the sampled lip tone muted (saturation -40 %) and drawn toward the skin, a little redder than it
        vec3 lipBase = mix(vec3(dot(uLipTone, vec3(0.2126, 0.7152, 0.0722))), uLipTone, 0.6);
        lipBase = mix(lipBase, uTone * vec3(1.05, 0.88, 0.86), 0.3);
        vec3 lipCol = lipBase * mix(1.0, 0.88, exp(-abs(lf.y) * 0.9)) * lipTexture;
        lipCol = mix(lipCol, uLipstick, clamp(uLipstickAmount, 0.0, 1.0) * smoothstep(-0.12, 0.12, lf.x));
        diffuseColor.rgb = mix(diffuseColor.rgb, lipCol, lip);
        // the photo's fine detail (a ratio around 1: pores, freckles, moles, lip lines) over skin and lips;
        // not over the scalp tint, where the photo shows hair
        { vec3 f = skinRel; float k = skinConf * (1.0 - scalp) * (1.0 - 0.6 * clamp(uLipstickAmount, 0.0, 1.0) * lip);
          diffuseColor.rgb *= mix(vec3(1.0), f, k); }
        // stubble: fine dark dots over the beard and moustache, never on the lips
        float beard = (1.0 - smoothstep(uY.y - 4.0, uY.y + 6.0, vP.y)) * smoothstep(uY.w - 30.0, uY.w - 10.0, vP.y) * (1.0 - smoothstep(55.0, 70.0, ax));
        float dots = step(0.62, hash(floor(vP * 3.2)));
        diffuseColor.rgb *= 1.0 - uStubble * beard * (1.0 - lip) * (1.0 - skinConf) * (0.18 + 0.42 * dots);
        // the portrait fade below the chest
        // a soft oval vignette: the chest and shoulders melt into the background, no cut edge and no corners
        { float dy = max(0.0, uChest + 40.0 - vP.y) / 45.0, dx = max(0.0, ax - 95.0) / 80.0;
          diffuseColor.a *= 1.0 - smoothstep(0.55, 1.0, length(vec2(dx, dy))); }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + (dA.r - 0.5) * 0.24, 0.3, 0.72);
        // the T-zone a little shinier, lips moist (or the lipstick's finish)
        roughnessFactor -= 0.13 * (1.0 - smoothstep(9.0, 22.0, ax)) * smoothstep(uY.y - 10.0, uY.x + 30.0, vP.y);   // T-zone ~0.42, cheeks ~0.55
        roughnessFactor = mix(roughnessFactor, mix(0.5, mix(0.62, 0.12, uLipstickGloss), uLipstickAmount), lip);   // bare lips ~0.5: soft, not wet`)
      // no clearcoat or sheen on bare lips (the skin's coat made them read glossy red); a glossy lipstick brings its own
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
        material.clearcoat *= 1.0 - lip * (1.0 - uLipstickAmount * uLipstickGloss);
        #ifdef USE_SHEEN
        material.sheenColor *= 1.0 - lip;
        #endif`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        if (uDetailOn > 0.5) {                        // pores and fine creases as micro normals
          float e = 0.35; vec3 g = vec3(tri(vP + vec3(e,0,0), vN, 9.3).r - tri(vP - vec3(e,0,0), vN, 9.3).r,
                                        tri(vP + vec3(0,e,0), vN, 9.3).r - tri(vP - vec3(0,e,0), vN, 9.3).r,
                                        tri(vP + vec3(0,0,e), vN, 9.3).r - tri(vP - vec3(0,0,e), vN, 9.3).r);
          normal = normalize(normal - (viewMatrix * vec4(g, 0.0)).xyz * 0.28 * (1.0 - lip * 0.6));   // low intensity: the photo carries the real detail
        }`)
      .replace('#include <opaque_fragment>', `
        // subsurface: light bleeds past the terminator in warm red; thin backlit parts (ears, nostril wings) glow
        vec3 Nw = normalize(vN), Lw = normalize(vec3(-0.35, 0.65, 0.65));
        float ndl = dot(Nw, Lw), wrap = clamp((ndl + 0.5) / 1.5, 0.0, 1.0) - clamp(ndl, 0.0, 1.0);
        float thin = smoothstep(55.0, 75.0, ax) * (1.0 - smoothstep(-10.0, 25.0, vP.z - 0.0)) + (1.0 - smoothstep(10.0, 20.0, ax)) * smoothstep(uY.y - 6.0, uY.y + 2.0, vP.y) * (1.0 - smoothstep(uY.y + 4.0, uY.y + 14.0, vP.y)) * 0.5;
        float back = pow(clamp(dot(normalize(-vViewPosition), -normalize((viewMatrix * vec4(Lw, 0.0)).xyz)), 0.0, 1.0), 3.0);
        outgoingLight += diffuseColor.rgb * uSSS * uSSSAmt * (0.26 * max(wrap, 0.0) + 0.02 + 0.4 * thin * (0.35 + back));   // wrap: light bleeds warm past the terminator; a little everywhere (skin is never matte paint)
        #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'ames-portrait-skin-v3';
  return {
    useSkinMap: (map: Texture | null, conf: Texture | null, rect?: [number, number, number, number]) => { U.uSkinMap.value = map; U.uSkinConf.value = conf; U.uSkinOn.value = map && conf && rect ? 1 : 0; if (rect) U.uSkinRect.value.set(...rect); }, material: m, uniforms: U, setLipstick: (l: Lipstick | null) => { U.uLipstickAmount.value = l ? l.amount : 0; if (l) { U.uLipstick.value.set(l.color); U.uLipstickGloss.value = l.gloss; } },
    setTones: (t: ToneMap) => { U.uTone.value.set(t.base); U.uForehead.value.set(t.forehead ?? t.base); U.uCheeks.value.set(t.cheeks ?? t.base); U.uNose.value.set(t.nose ?? t.base);
      U.uJaw.value.set(t.jaw ?? t.base); U.uLipTone.value.set(t.lips ?? t.base).multiply(t.lips ? new Color('#ffffff') : new Color('#eeb4b0')); m.sheenColor.set(t.base).lerp(new Color('#ffffff'), 0.5); } };
}

/** Living eyes: a procedural iris (fibres, a darker limbal ring, collarette, pupil), a wet cornea bulge with sharp
 *  catchlights from the HDR studio, and a sclera that is not paper white. Works on the eye meshes' own direction:
 *  the eye's forward axis is found from its geometry (+z out of the face). */
/** MakeHuman's photographic eye texture (CC0) for the high-poly eye proxy. */
export const EYE_TEXTURE_URL = '/portrait-twin/eye-brown.png';
/**
 * The eyeball from MakeHuman's high-poly eye proxy and its photographic texture: a real sclera with vessels, a real
 * iris (re-coloured to the scan's iris colour, its fibres and darkness kept), wet and glossy. The proxy's own cornea
 * shell maps to a transparent texel and is cut away; the corneal bulge is drawn by portrait-eyes.ts.
 */
export function portraitEyeTextured(o: { env: Texture | null; iris: string; map: Texture }) {
  const m = new MeshPhysicalMaterial({ map: o.map, alphaTest: 0.5, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.03, envMap: o.env, envMapIntensity: 0.9, ior: 1.376, specularIntensity: 0.8 });
  const U = { uIris: { value: new Color(o.iris) } };
  m.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, U);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uIris;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        { vec3 c = diffuseColor.rgb; float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b)), sat = (mx - mn) / max(mx, 1e-3);
          float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
          // the iris: saturated and darker than the sclera (vessels are saturated but light): take the scan's colour,
          // keep the photo's fibres and shading
          float irisM = smoothstep(0.25, 0.45, sat) * (1.0 - smoothstep(0.18, 0.32, lum));
          vec3 tinted = uIris * (lum / max(1e-3, dot(uIris, vec3(0.2126, 0.7152, 0.0722)))) * 1.1;
          diffuseColor.rgb = mix(c, tinted, irisM);
          diffuseColor.rgb *= vec3(0.97, 0.94, 0.9);                    // the white of the eye is never paper white
        }`);
  };
  m.customProgramCacheKey = () => 'ames-portrait-eye-textured';
  return m;
}

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
        float irisA = 0.505, pupilA = 0.17;                // an 11.7 mm iris on a 24 mm eyeball, a 4 mm pupil
        float fib = 0.75 + 0.25 * sin(ang * 70.0 + h1(floor(ang * 11.0)) * 6.0) * (0.6 + 0.4 * sin(a * 40.0));
        vec3 iris = uIris * fib * mix(1.25, 0.8, smoothstep(pupilA, irisA, a));
        iris = mix(iris, uIris * 1.5 + 0.05, smoothstep(0.02, 0.0, abs(a - pupilA * 1.55)) * 0.35);   // the collarette
        iris *= mix(1.0, 0.35, smoothstep(irisA - 0.08, irisA, a));                                      // the limbal ring
        vec3 sclera = vec3(0.74, 0.7, 0.65) * mix(1.0, 0.72, smoothstep(0.75, 1.45, a));                  // never paper white: warm, shadowed toward the lids and corners
        sclera *= mix(1.0, 0.8, smoothstep(0.55, 0.95, abs(d.x)));
        sclera = mix(sclera, vec3(0.9, 0.62, 0.6), 0.12 * smoothstep(1.1, 1.5, a) * (0.5 + 0.5 * sin(ang * 23.0)));  // faint vessels
        vec3 col = mix(iris, sclera, smoothstep(irisA - 0.01, irisA + 0.025, a));
        col = mix(vec3(0.012), col, smoothstep(pupilA - 0.015, pupilA + 0.01, a));                      // the pupil
        diffuseColor.rgb = col;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(0.08, 0.22, smoothstep(0.4, 0.6, acos(clamp(normalize(vE - uC).z, -1.0, 1.0))));`);
  };
  m.customProgramCacheKey = () => 'ames-portrait-eye';
  m.userData.eyeCentre = U.uC;
  return m;
}

/** Point each eye's iris at the eyeball's true centre after the face's shape was (re)baked: the shape moves the eyes. */
export function refreshEyeCentres(eyes: Mesh[]) {
  for (const e of eyes) {
    const u = (e.material as Material).userData?.eyeCentre as { value: Vector3 } | undefined; if (!u) continue;
    const p = e.geometry.getAttribute('position'); u.value.set(0, 0, 0);            // the mean of the eyeball's surface
    for (let i = 0; i < p.count; i++) { u.value.x += p.getX(i); u.value.y += p.getY(i); u.value.z += p.getZ(i); }
    u.value.divideScalar(Math.max(1, p.count));
  }
}

export function teethMaterial(env: Texture | null) {
  // ivory, not white: teeth sit in the mouth's shade and are never brighter than the eye whites
  // warm off-white, no coat (a coat reflected the dark mouth as grey); a faint fill so the mouth's shade never greys them
  return new MeshPhysicalMaterial({ color: '#ede6da', roughness: 0.3, envMap: env, envMapIntensity: 0.3, emissive: new Color('#ede6da'), emissiveIntensity: 0.08 });
}
export function tongueMaterial(env: Texture | null) {
  return new MeshPhysicalMaterial({ color: '#b5545c', roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.2, envMap: env, envMapIntensity: 0.25 });
}

/** The lips' box on the face (mm, from the skin landmarks): half width, bottom, top, and how far back. */
export function lipBoxFrom(lm: number[][]) {
  const xs = [61, 291, 78, 308].map(i => Math.abs(lm[i][0])), ys = [0, 37, 267, 17, 84, 314, 61, 291].map(i => lm[i][1]), zs = [61, 291].map(i => lm[i][2]);
  return new Vector4(Math.max(...xs) + 1.5, Math.min(...ys) - 1.5, Math.max(...ys) + 1.5, Math.min(...zs) - 8);
}
