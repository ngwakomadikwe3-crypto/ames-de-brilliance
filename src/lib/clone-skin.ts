import { Color, MeshPhysicalMaterial, SRGBColorSpace, type Texture } from 'three';
// Skin for the cloned hand: the customer's photo on the back of the hand, their sampled tone everywhere else,
// soft sheen for the fine surface, light that wraps round the edges and glows red through thin parts
// (a subsurface scattering approximation), and glossier nails.
export function skinMaterial(tone: string, photo?: Texture) {
  const m = new MeshPhysicalMaterial({
    color: '#ffffff', roughness: 0.52, metalness: 0, sheen: 0.35, sheenRoughness: 0.6,
    sheenColor: new Color(tone).lerp(new Color('#ffffff'), 0.35), specularIntensity: 0.45,
  });
  if (photo) { photo.colorSpace = SRGBColorSpace; m.map = photo; }
  const toneColor = new Color(tone);
  m.onBeforeCompile = shader => {
    shader.uniforms.toneColor = { value: toneColor };
    shader.uniforms.hasPhoto = { value: photo ? 1 : 0 };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float dorsal;\nattribute float nail;\nvarying float vDorsal;\nvarying float vNail;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDorsal = dorsal; vNail = nail;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 toneColor;\nuniform float hasPhoto;\nvarying float vDorsal;\nvarying float vNail;')
      // Photo where it was photographed (the back of the hand), the sampled tone round the sides and palm.
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec3 tone = toneColor * (0.92 + 0.08 * vDorsal);
        diffuseColor.rgb = mix(tone, diffuseColor.rgb, hasPhoto * smoothstep(0.15, 0.85, vDorsal));
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.06, 0.98, 0.98) + 0.04, vNail * (1.0 - hasPhoto));`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.24, vNail);')
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        float rim = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 2.5);
        reflectedLight.indirectDiffuse += diffuseColor.rgb * vec3(0.30, 0.10, 0.07) * rim;
        reflectedLight.directDiffuse += diffuseColor.rgb * vec3(0.10, 0.035, 0.025);`);
  };
  m.customProgramCacheKey = () => 'ames-skin-' + (photo ? 1 : 0);
  return m;
}
