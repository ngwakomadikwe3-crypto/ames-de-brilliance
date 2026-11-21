// Skin and nails for the realistic hand twin, lit by the same studio environment as the jewellery.
// Skin:  * subsurface light: a softened, reddened terminator everywhere, and light through thin tissue (fingertips,
//          webbing, the edges of the hand) from the baked thickness;
//        * creases drawn per pixel as a bump field from baked coordinates: knuckle wrinkles on the back of each joint,
//          flexion creases on the pads (deeper as the joint bends), the palm's three main lines, wrist bracelets,
//          plus fine pores and skin lines;
//        * per-region roughness (matte palm, soft sheen on the back, pads a little rougher) and colour variation
//          (palm lighter, knuckles and joints redder, fingertips warmer, creases darker), baked ambient occlusion,
//          contact shadow where metal touches skin, and the forearm fading out (never a cut edge).
// Nails: their own material: pink bed through a glossy translucent plate, pale lunula, see-through free edge.
import { Color, DoubleSide, FrontSide, MeshPhysicalMaterial, ShaderChunk, SRGBColorSpace, Vector3, Vector4, type Texture } from 'three';

export interface SkinUniforms {
  bends: { value: Float32Array };                      // per bone, 0 straight .. 1 at 90 degrees
  contactCentre: { value: Vector3[] }; contactAxis: { value: Vector3[] }; contactSize: { value: Vector4[] }; contactCount: { value: number };
}

const NOISE = /* glsl */`
float amesHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float amesNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(amesHash(i), amesHash(i + vec3(1,0,0)), f.x), mix(amesHash(i + vec3(0,1,0)), amesHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(amesHash(i + vec3(0,0,1)), amesHash(i + vec3(1,0,1)), f.x), mix(amesHash(i + vec3(0,1,1)), amesHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
vec3 amesBump(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection) {
  vec3 vSigmaX = normalize(dFdx(surf_pos)), vSigmaY = normalize(dFdy(surf_pos)), vN = surf_norm;
  vec3 R1 = cross(vSigmaY, vN), R2 = cross(vN, vSigmaX);
  float fDet = dot(vSigmaX, R1) * faceDirection;
  vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
  return normalize(abs(fDet) * surf_norm - vGrad);
}`;

// palm lines in the template's palm-plane coordinates (mm): heart, head, life, and a faint fate line
const PALM_LINES = [
  [[42, 64], [24, 71], [6, 76], [-10, 81], [-18, 84]],
  [[-31, 69], [-16, 63], [2, 57], [20, 52], [33, 48]],
  [[-31, 67], [-25, 55], [-21, 42], [-16, 28], [-10, 14]],
  [[4, 14], [5, 30], [6, 46]],
];
const glslLines = () => {
  let code = 'float amesPalmLines(vec2 p) {\n  float g = 0.0, d;\n';
  PALM_LINES.forEach((line, li) => {
    code += '  d = 1e3;\n';
    for (let k = 0; k < line.length - 1; k++) {
      const [a, b] = [line[k], line[k + 1]];
      code += `  { vec2 a = vec2(${a[0].toFixed(1)}, ${a[1].toFixed(1)}), ab = vec2(${(b[0] - a[0]).toFixed(1)}, ${(b[1] - a[1]).toFixed(1)}); float t = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0); d = min(d, length(p - a - ab * t)); }\n`;
    }
    code += `  g = max(g, ${li === 3 ? '0.35' : '1.0'} * exp(-d * d / ${li === 3 ? '0.18' : '0.32'}));\n`;
  });
  return code + '  return g;\n}\n';
};

export function realisticSkin(tone: string, env: Texture | null, chainS: number[][], photo?: Texture) {
  const m = new MeshPhysicalMaterial({
    color: '#ffffff', roughness: 0.5, metalness: 0, ior: 1.4, specularIntensity: 0.55,
    sheen: 0.3, sheenRoughness: 0.55, sheenColor: new Color(tone).lerp(new Color('#ffffff'), 0.45),
    envMap: env, envMapIntensity: 0.85, transparent: true, side: FrontSide,
  });
  if (photo) { photo.colorSpace = SRGBColorSpace; m.map = photo; }
  const toneColor = new Color(tone);
  const chains = [0, 1, 2, 3, 4].map(f => { const c = chainS[f] ?? []; return new Vector4(c[0] ?? 0, c[1] ?? 999, c[2] ?? 999, c[3] ?? 999); });
  const uniforms: SkinUniforms = {
    bends: { value: new Float32Array(21) },
    contactCentre: { value: [new Vector3(), new Vector3()] }, contactAxis: { value: [new Vector3(0, 1, 0), new Vector3(0, 1, 0)] },
    contactSize: { value: [new Vector4(), new Vector4()] }, contactCount: { value: 0 },
  };
  m.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms, { toneColor: { value: toneColor }, hasPhoto: { value: photo ? 1 : 0 }, chainS: { value: chains } });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 aFinger; attribute vec4 aSkin; attribute vec4 aPalm;
        varying vec4 vFinger; varying vec4 vSkin; varying vec4 vPalm; varying vec3 vRest; varying vec3 vAmesWorld; varying float vBendA; varying float vBendB; varying float vBendC;
        uniform float bends[21];`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vFinger = aFinger; vSkin = aSkin; vPalm = aPalm; vRest = position;
        { int f = int(floor(aFinger.y * 8.0 + 0.5)); int k = f == 0 ? 2 : 1 + 4 * f;
          vBendA = f < 5 ? bends[k] : 0.0; vBendB = f < 5 ? bends[k + 1] : 0.0; vBendC = f < 5 && f > 0 ? bends[k + 2] : 0.0; }`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        vAmesWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec3 toneColor; uniform float hasPhoto; uniform vec4 chainS[5];
        uniform vec3 contactCentre[2]; uniform vec3 contactAxis[2]; uniform vec4 contactSize[2]; uniform int contactCount;
        varying vec4 vFinger; varying vec4 vSkin; varying vec4 vPalm; varying vec3 vRest; varying vec3 vAmesWorld; varying float vBendA; varying float vBendB; varying float vBendC;
        float amesCrease; float amesAO; float amesThin; float amesDorsal;
        ${NOISE}
        ${glslLines()}
        float amesGroove(float d, float spacing, float width) { float x = abs(fract(d / spacing + 0.5) - 0.5) * spacing; return 1.0 - smoothstep(0.0, width, x); }
        float amesLine(float d, float w) { return exp(-d * d / (2.0 * w * w)); }
        // crease depth field (mm, positive = into the skin) and its darkening mask
        float amesHeight(out float mask) {
          float s = vFinger.x * 128.0, around = vFinger.z; int f = int(floor(vFinger.y * 8.0 + 0.5));
          float back = 1.0 - smoothstep(0.25, 0.62, abs(around)), pad = smoothstep(0.5, 0.88, abs(around));
          float g = 0.0, cr = 0.0;
          if (f < 5) {
            vec4 cs = chainS[f];
            // knuckle wrinkles on the back: concentric, curving round the joint, smoothing out as it bends
            float bA = vBendA, bB = vBendB, bC = vBendC;
            float dA = s - cs.x - 1.2 * around * around, dB = s - cs.y - 0.6 - 1.6 * around * around, dC = s - cs.z - 0.3 - 1.2 * around * around;
            float wr = amesGroove(dA, 1.35, 0.32) * amesLine(dA, 3.4) * 0.45 * (1.0 - 0.5 * bA)
                     + amesGroove(dB, 1.05, 0.26) * amesLine(dB, 2.6) * (f == 0 ? 0.6 : 1.0) * (1.0 - 0.55 * bB)
                     + amesGroove(dC, 0.95, 0.24) * amesLine(dC, 2.0) * 0.7 * (1.0 - 0.55 * bC);
            g += wr * back * 0.07;
            // flexion creases on the pad side: sharp lines that deepen as the joint closes
            float base = f == 0 ? 0.0 : cs.y * 0.3;
            float fl = (amesLine(s - base - 0.6, 0.2) + amesLine(s - base + 0.6, 0.2)) * (0.7 + 0.8 * bA)
                     + (amesLine(s - cs.y - 0.8, 0.18) + amesLine(s - cs.y + 0.6, 0.18)) * (0.8 + 1.0 * bB)
                     + amesLine(s - cs.z - 0.3, 0.18) * (0.8 + 1.0 * bC);
            g += fl * pad * 0.11; cr += fl * pad;
            // fingerprint ridges on the pads, faint
            g += 0.006 * pad * smoothstep(cs.z, cs.w, s) * sin(dot(vRest.xz, vec2(1.0)) * 11.0 + amesNoise(vRest * 0.6) * 6.0);
          }
          // palm lines and wrist bracelets (palm side only)
          float palmSide = 1.0 - smoothstep(0.15, 0.55, vPalm.z);
          vec2 pp = vec2(vPalm.x * 128.0, vPalm.y * 256.0);
          float pl = amesPalmLines(pp) * palmSide * step(4.0, pp.y);
          float wrist = (amesLine(pp.y - 3.0, 0.35) + 0.7 * amesLine(pp.y + 3.5, 0.35)) * palmSide * smoothstep(34.0, 20.0, abs(pp.x - 2.0));
          wrist += 0.3 * amesLine(pp.y - 1.0, 0.6) * vPalm.z * smoothstep(30.0, 18.0, abs(pp.x));
          g += pl * 0.12 + wrist * 0.08; cr += pl + wrist * 0.8;
          // pores and fine skin lines
          float n1 = amesNoise(vRest * 2.6), n2 = amesNoise(vRest * 7.0 + 3.1);
          g += (n1 - 0.5) * 0.010 + smoothstep(0.75, 0.95, n2) * 0.010 + amesGroove(dot(vRest, vec3(0.7, 0.4, 0.6)) + n1 * 2.0, 0.55, 0.06) * 0.004;
          mask = clamp(cr, 0.0, 1.0);
          return g;
        }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        amesDorsal = vPalm.z; amesThin = exp(-vSkin.x * 40.0 / 5.5); amesAO = vSkin.y;
        float knuckle = vFinger.w, tip = vSkin.z, fore = vSkin.w;
        float lum = dot(toneColor, vec3(0.299, 0.587, 0.114));
        vec3 tone = toneColor;
        // palm lighter (much lighter for deeper skin tones), back of hand the sampled tone
        vec3 palmTone = mix(tone * vec3(1.10, 1.03, 0.97) + vec3(0.03, 0.02, 0.015), tone * vec3(1.55, 1.32, 1.18) + vec3(0.10, 0.06, 0.05), clamp(1.0 - lum * 1.8, 0.0, 1.0));
        vec3 skinCol = mix(palmTone, tone, smoothstep(0.1, 0.75, amesDorsal));
        skinCol = mix(skinCol, diffuseColor.rgb, hasPhoto * smoothstep(0.2, 0.85, amesDorsal));
        // knuckles and joints redder and a touch darker; fingertips flushed warmer
        skinCol *= mix(vec3(1.0), vec3(0.93, 0.80, 0.78) * mix(1.0, 0.86, 1.0 - lum), clamp(knuckle * 0.75, 0.0, 1.0));
        skinCol = mix(skinCol, skinCol * vec3(1.10, 0.88, 0.85) + vec3(0.025, 0.0, 0.0), tip * 0.55);
        // gentle mottling
        float mot = amesNoise(vRest * 0.35) - 0.5, mot2 = amesNoise(vRest * 1.3 + 7.0) - 0.5;
        skinCol *= 1.0 + mot * 0.06 + mot2 * 0.03;
        skinCol = mix(skinCol, skinCol * vec3(1.04, 0.95, 0.96), smoothstep(0.1, 0.4, mot) * 0.4);
        diffuseColor.rgb = skinCol;
        float creaseMask; float amesH = amesHeight(creaseMask);
        diffuseColor.rgb *= 1.0 - 0.22 * creaseMask;
        // forearm: fades to nothing, darkening a little first (no cut edge)
        diffuseColor.rgb *= mix(1.0, 0.82, smoothstep(0.15, 0.6, fore));
        diffuseColor.a *= 1.0 - smoothstep(0.32, 0.88, fore);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = amesBump(-vViewPosition, normal, vec2(dFdx(amesH), dFdy(amesH)) * 1.0, faceDirection);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        { float creaseR; amesHeight(creaseR);
          float pad = smoothstep(0.5, 0.88, abs(vFinger.z));
          roughnessFactor = mix(0.62, 0.44, smoothstep(0.1, 0.75, vPalm.z));      // matte palm, satin back
          roughnessFactor = mix(roughnessFactor, 0.56, pad * smoothstep(0.3, 1.0, vSkin.z));
          roughnessFactor += 0.08 * creaseR + 0.04 * (amesNoise(vRest * 3.0) - 0.5); }`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
        material.sheenColor *= mix(0.35, 1.0, smoothstep(0.1, 0.75, vPalm.z));`)
      .replace('#include <lights_fragment_begin>', ShaderChunk.lights_fragment_begin
        .replaceAll('RE_Direct( directLight,', 'amesScatter( directLight, geometryNormal, geometryViewDir ); RE_Direct( directLight,')
        .replace('vec3 geometryPosition', `vec3 amesSSS = vec3(0.0);
          #define amesScatter(dl, n, v) { float ndl = dot(n, dl.direction); \\
            float wrapL = clamp((ndl + 0.55) / 1.55, 0.0, 1.0) - clamp(ndl, 0.0, 1.0); \\
            vec3 H = normalize(dl.direction + n * 0.4); float back = pow(clamp(dot(v, -H), 0.0, 1.0), 3.0); \\
            amesSSS += dl.color * (wrapL * 0.5 + (back * 2.2 + 0.12) * amesThin); }
          vec3 geometryPosition`))
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
        { float contact = 0.0;
          for (int i = 0; i < 2; i++) { if (i >= contactCount) break;
            vec3 r = vAmesWorld - contactCentre[i]; float ax = dot(r, contactAxis[i]); float rad = length(r - contactAxis[i] * ax);
            float da = max(abs(ax) - contactSize[i].y, 0.0), dr = rad - contactSize[i].x;
            contact = max(contact, exp(-(da * da + dr * dr) / (2.0 * contactSize[i].z * contactSize[i].z))); }
          float occ = amesAO * (1.0 - 0.55 * contact);
          reflectedLight.indirectDiffuse *= occ; reflectedLight.indirectSpecular *= mix(1.0, occ, 0.8);
          reflectedLight.directDiffuse *= 1.0 - 0.35 * contact;
          vec3 sssTint = vec3(1.0, 0.30, 0.20);
          reflectedLight.directDiffuse += amesSSS * diffuseColor.rgb * sssTint;
          reflectedLight.indirectDiffuse += diffuseColor.rgb * sssTint * amesThin * 0.35 * occ; }`);
  };
  m.customProgramCacheKey = () => 'ames-real-skin-' + (photo ? 1 : 0);
  return { material: m, uniforms };
}

export function realisticNails(tone: string, env: Texture | null) {
  const m = new MeshPhysicalMaterial({
    color: '#ffffff', roughness: 0.24, metalness: 0, ior: 1.52, specularIntensity: 0.6,
    clearcoat: 0.45, clearcoatRoughness: 0.12, envMap: env, envMapIntensity: 0.32, transparent: true, side: DoubleSide,
  });
  const toneColor = new Color(tone);
  m.onBeforeCompile = shader => {
    shader.uniforms.toneColor = { value: toneColor };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aNail; varying vec4 vNail; varying vec3 vNailPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvNail = aNail; vNailPos = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform vec3 toneColor; varying vec4 vNail; varying vec3 vNailPos;\n${NOISE}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        float u = vNail.x, v = vNail.y, free = vNail.z * 4.0, top = vNail.w;
        float lum = dot(toneColor, vec3(0.299, 0.587, 0.114));
        // the bed shows through the plate: tone pushed pink, a little paler toward the sides
        // (colours here are linear light)
        vec3 bed = mix(toneColor * vec3(1.0, 0.80, 0.82), vec3(0.56, 0.24, 0.24), 0.45);
        bed = mix(bed, bed * vec3(1.05, 1.08, 1.08) + 0.02, smoothstep(0.55, 1.0, abs(v)));
        // lunula: pale half-moon at the base
        float lun = 1.0 - smoothstep(0.85, 1.05, length(vec2(v * 0.9, (u - 0.02) / 0.2)));
        vec3 col = mix(bed, vec3(0.74, 0.62, 0.60), lun * 0.6);
        // free edge: off-white, translucent, with the pale band where it leaves the finger
        float freeEdge = smoothstep(0.0, 0.25, free);
        col = mix(col, vec3(0.86, 0.80, 0.70), freeEdge);
        col = mix(col, vec3(0.93, 0.90, 0.84), (1.0 - smoothstep(0.0, 0.35, abs(free - 0.12))) * 0.5);
        col *= 0.96 + 0.08 * amesNoise(vNailPos * vec3(6.0, 0.6, 6.0));               // faint lengthwise ridges
        col = mix(col * 0.92, col, top);
        diffuseColor.rgb = col;
        diffuseColor.a = mix(1.0, 0.78, freeEdge);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        { float h = 0.004 * sin(vNail.y * 26.0 + amesNoise(vNailPos * 2.0) * 2.0);
          normal = amesBump(-vViewPosition, normal, vec2(dFdx(h), dFdy(h)), faceDirection); }`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
        reflectedLight.directDiffuse += diffuseColor.rgb * vec3(0.12, 0.03, 0.02) * (1.0 - smoothstep(0.0, 0.3, vNail.z * 4.0));`);
  };
  m.customProgramCacheKey = () => 'ames-real-nail';
  return m;
}
