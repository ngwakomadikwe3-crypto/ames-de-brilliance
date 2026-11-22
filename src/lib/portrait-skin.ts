// Skin for the portrait twin (the MakeHuman bust). Physically based like the hand's skin (sheen, a clearcoat second
// highlight, the boutique tent light) with a warm wrap term for light bleeding through skin, and the portrait fade:
// the skin falls into shadow above the hairline, below the chest and at the shoulder cuts, like a jewellery
// photograph lit on a dark set, so the bust needs no hair and never shows a cut edge.
import { Color, FrontSide, Matrix4, MeshPhysicalMaterial, type Texture } from 'three';

export type PortraitFade = { hairline: number; chest: number; side: number };   // mm, in the bust's own frame

export function portraitSkin(tone: string, env: Texture | null, fade: PortraitFade, detail?: Texture) {
  const toneColor = new Color(tone);
  const m = new MeshPhysicalMaterial({
    color: toneColor, roughness: 0.5, metalness: 0, ior: 1.4, specularIntensity: 0.5,
    sheen: 0.35, sheenRoughness: 0.5, sheenColor: toneColor.clone().lerp(new Color('#ffffff'), 0.45),
    clearcoat: 0.18, clearcoatRoughness: 0.45, envMap: env, envMapIntensity: env ? 0.4 : 0.25,
    transparent: true, side: FrontSide,
  });
  const uniforms = {
    uHair: { value: fade.hairline }, uChest: { value: fade.chest }, uSide: { value: fade.side },
    uBleed: { value: toneColor.clone().lerp(new Color('#c2452d'), 0.55) },
    // world -> the bust's own frame in mm (set every frame: the head turns). Vertex positions can't be used
    // directly: the compressed model stores them quantised.
    uToBust: { value: new Matrix4() },
    // skin detail (the hand twin's tileable 10 mm texture: R furrows and pores, B mottling), triplanar in the bust frame
    uDetail: { value: detail ?? null }, uDetailOn: { value: detail ? 1 : 0 },
  };
  m.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBust;\nvarying vec3 vBustN;\nuniform mat4 uToBust;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBust = (uToBust * modelMatrix * vec4(transformed, 1.0)).xyz;\nvBustN = normalize(mat3(uToBust * modelMatrix) * objectNormal);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBust;\nvarying vec3 vBustN;\nuniform float uHair, uChest, uSide, uDetailOn;\nuniform vec3 uBleed;\nuniform sampler2D uDetail;\nvec3 skinDetail() {\n  if (uDetailOn < 0.5) return vec3(0.5);\n  vec3 w = pow(abs(normalize(vBustN)), vec3(4.0)); w /= dot(w, vec3(1.0));\n  vec3 p = vBust / 7.3, q = vBust / 17.9 + 0.37;   // two scales, so the 10 mm tile never reads as a grid\n  vec3 a = texture2D(uDetail, p.yz).rgb * w.x + texture2D(uDetail, p.xz).rgb * w.y + texture2D(uDetail, p.xy).rgb * w.z;\n  vec3 b = texture2D(uDetail, q.yz).rgb * w.x + texture2D(uDetail, q.xz).rgb * w.y + texture2D(uDetail, q.xy).rgb * w.z;\n  return mix(a, b, 0.5);\n}')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nvec3 sd = skinDetail();\nroughnessFactor = clamp(roughnessFactor + (sd.r - 0.5) * 0.22, 0.32, 0.72);\ndiffuseColor.rgb *= 0.97 + 0.06 * sd.b;')
      .replace('#include <opaque_fragment>', `
        // light bleeding through the skin: a warm wrap where the key light grazes (ears, nostrils, neck edges)
        float graze = 1.0 - abs(dot(normalize(normal), vec3(0.0, 0.0, 1.0)));
        outgoingLight += uBleed * 0.035 * graze;
        // the portrait fade
        float a = 1.0 - smoothstep(uHair, uHair + 55.0, vBust.y);
        a *= smoothstep(uChest, uChest + 45.0, vBust.y);
        a *= 1.0 - smoothstep(uSide - 40.0, uSide, abs(vBust.x));
        diffuseColor.a *= a;
        #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'ames-portrait-skin';
  m.userData.tone = tone;
  return { material: m, uniforms };
}

/** Eyes: MakeHuman's eye helpers with painted sclera, iris and pupil (vertex colours), a wet clearcoat. */
export function portraitEyes(env: Texture | null) {
  return new MeshPhysicalMaterial({ vertexColors: true, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.04, envMap: env, envMapIntensity: 0.6 });
}
