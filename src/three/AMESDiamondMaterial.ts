import { Matrix4, Mesh, ShaderMaterial, Texture, Vector3, Vector4 } from 'three';
import type { WebGLRenderer } from 'three';

/** Exact support planes of a convex canonical mesh. Read-only: no vertex/index mutation. */
export function canonicalFacetPlanes(mesh: Mesh) {
  const position = mesh.geometry.getAttribute('position');
  const index = mesh.geometry.getIndex();
  const count = index?.count ?? position.count;
  const planes: Vector4[] = [];
  const a = new Vector3(), b = new Vector3(), c = new Vector3();
  const edge = new Vector3(), normal = new Vector3();
  const points = Array.from({ length: position.count }, (_, i) => new Vector3().fromBufferAttribute(position, i));
  const scale = Math.max(...points.map(p => p.length())) * 2;
  const tolerance = scale * 0.00002;
  for (let i = 0; i < count; i += 3) {
    a.copy(points[index ? index.getX(i) : i]);
    b.copy(points[index ? index.getX(i + 1) : i + 1]);
    c.copy(points[index ? index.getX(i + 2) : i + 2]);
    normal.crossVectors(edge.subVectors(b, a), c.sub(a));
    if (normal.lengthSq() < 1e-18) continue;
    normal.normalize();
    const distance = normal.dot(a);
    if (points.some(p => normal.dot(p) - distance > tolerance)) throw new Error('Canonical stone must be convex with outward facets');
    if (!planes.some(p => Math.abs(p.x-normal.x)+Math.abs(p.y-normal.y)+Math.abs(p.z-normal.z)<0.00015 && Math.abs(p.w-distance)<tolerance)) {
      planes.push(new Vector4(normal.x, normal.y, normal.z, distance));
    }
  }
  if (planes.length < 4 || planes.length > 224) throw new Error('Unsupported canonical facet count');
  const optical = planes.filter(p => Math.abs(p.y) >= 1e-8);
  const girdle = planes.filter(p => Math.abs(p.y) < 1e-8);
  const interiorRadius = girdle.length ? Math.min(...girdle.map(p => p.w / Math.hypot(p.x, p.z))) : 0;
  return { planes: [...optical, ...girdle], scale, opticalCount: optical.length, interiorRadius };
}

/** Chat's single diamond path: deterministic transport through canonical facet planes. */
export function createAMESDiamondMaterial(mesh: Mesh, environment: Texture, mobile = false) {
  const { planes, scale, opticalCount, interiorRadius } = canonicalFacetPlanes(mesh);
  const image = environment.image as { height: number };
  const maxMip = Math.log2(image.height) - 2;
  const material = new ShaderMaterial({
    name: 'AMES Chat Facet Transport',
    defines: {
      ...(mobile ? { AMES_MOBILE: 1 } : {}),
      ENVMAP_TYPE_CUBE_UV: '',
      FACET_COUNT: planes.length,
      OPTICAL_FACET_COUNT: opticalCount,
      CUBEUV_TEXEL_WIDTH: 1 / (3 * Math.max(2 ** maxMip, 112)),
      CUBEUV_TEXEL_HEIGHT: 1 / image.height,
      CUBEUV_MAX_MIP: maxMip.toFixed(1),
    },
    uniforms: {
      facets: { value: planes },
      girdleInteriorRadius2: { value: Math.max(0, interiorRadius * 0.99999) ** 2 },
      studio: { value: environment },
      worldFromLocal: { value: new Matrix4() },
      localFromWorld: { value: new Matrix4() },
      cameraLocal: { value: new Vector3() },
      rayEpsilon: { value: scale * 0.00001 },
    },
    vertexShader: /* glsl */`
      varying vec3 localPosition;
      void main() {
        localPosition = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      precision highp float;
      precision highp int;
      #include <common>
      #include <cube_uv_reflection_fragment>
      uniform vec4 facets[FACET_COUNT];
      uniform float girdleInteriorRadius2;
      uniform sampler2D studio;
      uniform mat4 worldFromLocal;
      uniform vec3 cameraLocal;
      uniform float rayEpsilon;
      varying vec3 localPosition;

      vec3 lightFrom(vec3 localDirection) {
        vec3 worldDirection = normalize(mat3(worldFromLocal) * localDirection);
        // Filter small panel edges during rotation, then retain highlight headroom
        // from the bright studio softboxes. A low neutral fill opens dark facets
        // without flattening their contrast or inventing screen-space sparkles.
        vec3 studioLight = textureCubeUV(studio, worldDirection, 0.16).rgb;
        #ifdef AMES_MOBILE
          return studioLight * 0.78 + vec3(0.035);
        #else
          return studioLight * 0.78 + vec3(0.022);
        #endif
      }
      float fresnel(float cosI, float eta) {
        float sinT2 = eta * eta * max(0.0, 1.0 - cosI * cosI);
        if (sinT2 >= 1.0) return 1.0;
        float cosT = sqrt(1.0 - sinT2);
        float rs = (eta * cosI - cosT) / (eta * cosI + cosT);
        float rp = (cosI - eta * cosT) / (cosI + eta * cosT);
        return 0.5 * (rs * rs + rp * rp);
      }
      vec3 transport(vec3 origin, vec3 incident, vec3 normal, float ior) {
        float entryF = fresnel(clamp(-dot(incident, normal), 0.0, 1.0), 1.0 / ior);
        vec3 radiance = entryF * lightFrom(reflect(incident, normal));
        float throughput = 1.0 - entryF;
        vec3 direction = normalize(refract(incident, normal, 1.0 / ior));
        origin += direction * rayEpsilon;
        // Deterministic split transport: collect each refracted exit; retain the
        // reflected branch (all energy at TIR). No noise or temporal accumulation.
        for (int bounce = 0; bounce < 12; bounce++) {
          float distance = 1e10;
          vec3 outward = vec3(0.0);
          // A ray inside a convex closed stone exits at the nearest forward
          // support plane. These are extracted from the actual loaded facets.
          for (int facet = 0; facet < OPTICAL_FACET_COUNT; facet++) {
            vec4 plane = facets[facet];
            float denominator = dot(plane.xyz, direction);
            if (denominator > 0.000001) {
              float candidate = (plane.w - dot(plane.xyz, origin)) / denominator;
              if (candidate > 0.0 && candidate < distance) {
                distance = candidate;
                outward = plane.xyz;
              }
            }
          }
          // A segment whose endpoints lie inside the girdle's inscribed
          // cylinder cannot cross a girdle plane. Conservatively skip that
          // group; the original planes remain authoritative for every hit.
          vec3 provisional = origin + direction * distance;
          if (max(dot(origin.xz, origin.xz), dot(provisional.xz, provisional.xz)) >= girdleInteriorRadius2) {
            for (int facet = OPTICAL_FACET_COUNT; facet < FACET_COUNT; facet++) {
              vec4 plane = facets[facet];
              float denominator = dot(plane.xyz, direction);
              if (denominator > 0.000001) {
                float candidate = (plane.w - dot(plane.xyz, origin)) / denominator;
                if (candidate > 0.0 && candidate < distance) {
                  distance = candidate;
                  outward = plane.xyz;
                }
              }
            }
          }
          if (distance > 1e9) break;
          vec3 point = origin + direction * distance;
          vec3 n = -outward;
          float f = fresnel(clamp(-dot(n, direction), 0.0, 1.0), ior);
          if (f < 1.0) {
            vec3 exitDirection = refract(direction, n, ior);
            vec3 redExit = refract(direction, n, ior - 0.003);
            vec3 blueExit = refract(direction, n, ior + 0.005);
            if (dot(redExit, redExit) < 0.1) redExit = exitDirection;
            if (dot(blueExit, blueExit) < 0.1) blueExit = exitDirection;
            vec3 spectral = vec3(lightFrom(redExit).r, lightFrom(exitDirection).g, lightFrom(blueExit).b);
            radiance += throughput * (1.0 - f) * spectral;
          }
          throughput *= f;
          if (throughput < 0.003) break;
          direction = normalize(reflect(direction, n));
          origin = point + direction * rayEpsilon;
        }
        #ifdef AMES_MOBILE
          // Bounded approximation for energy remaining after the finite trace.
          // Only the uncollected branch receives broad studio illumination;
          // resolved exits and their directional contrast remain authoritative.
          vec3 residualDirection = normalize(mat3(worldFromLocal) * direction);
          vec3 residual = textureCubeUV(studio, residualDirection, 0.6).rgb;
          radiance += throughput * clamp(residual * 0.12, vec3(0.025), vec3(0.12));
        #endif
        // Desktop keeps the original finite-transport result.
        return radiance;
      }
      void main() {
        vec3 incident = normalize(localPosition - cameraLocal);
        vec3 normal = normalize(cross(dFdx(localPosition), dFdy(localPosition)));
        if (dot(normal, incident) > 0.0) normal = -normal;
        vec3 radiance = transport(localPosition, incident, normal, 2.417);
        gl_FragColor = vec4(radiance, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const cameraWorld = new Vector3();
  const quality = mobile ? createMobileDiamondQuality() : null;
  const before = mesh.onBeforeRender;
  mesh.onBeforeRender = (renderer, scene, camera, geometry, activeMaterial, group) => {
    before.call(mesh, renderer, scene, camera, geometry, activeMaterial, group);
    quality?.frame(renderer);
    material.uniforms.worldFromLocal.value.copy(mesh.matrixWorld);
    material.uniforms.localFromWorld.value.copy(mesh.matrixWorld).invert();
    camera.getWorldPosition(cameraWorld);
    material.uniforms.cameraLocal.value.copy(cameraWorld).applyMatrix4(material.uniforms.localFromWorld.value);
  };
  material.addEventListener('dispose', () => {
    quality?.dispose();
    mesh.onBeforeRender = before;
  });
  return material;
}

/** Resolution only: optical transport, geometry and controls never change tier. */
function createMobileDiamondQuality() {
  let renderer: WebGLRenderer | undefined;
  let pending = 0, timer = 0, last = 0, elapsed = 0, frames = 0;
  let ceiling = 1.5, fastWindows = 0, interacting = false, disposed = false;
  const pointers = new Set<number>();
  const apply = () => {
    if (pending || disposed) return;
    pending = requestAnimationFrame(() => {
      pending = 0;
      if (!renderer || disposed) return;
      const ratio = Math.min(window.devicePixelRatio || 1, interacting ? 1 : ceiling);
      if (renderer.getPixelRatio() !== ratio) renderer.setPixelRatio(ratio);
    });
  };
  const down = (event: PointerEvent) => {
    pointers.add(event.pointerId);
    clearTimeout(timer); interacting = true; apply();
  };
  const up = (event: PointerEvent) => {
    if (!pointers.delete(event.pointerId)) return;
    if (pointers.size) return;
    clearTimeout(timer);
    timer = window.setTimeout(() => { interacting = false; last = 0; apply(); }, 250);
  };
  return {
    frame(activeRenderer: WebGLRenderer) {
      if (!renderer) {
        renderer = activeRenderer;
        renderer.domElement.addEventListener('pointerdown', down, { passive: true });
        window.addEventListener('pointerup', up, { passive: true });
        window.addEventListener('pointercancel', up, { passive: true });
        apply();
      }
      const now = performance.now(), gap = now - last;
      last = now;
      // Ignore background pauses and interaction; evaluate actual rendered frames.
      if (document.hidden || interacting || gap <= 0 || gap > 250) {
        elapsed = 0; frames = 0; return;
      }
      elapsed += gap; frames++;
      if (elapsed < 1500) return;
      const fps = frames * 1000 / elapsed;
      if (fps < 43) { ceiling = Math.max(1, ceiling - 0.25); fastWindows = 0; }
      else if (fps > 57 && ++fastWindows >= 4) { ceiling = Math.min(1.5, ceiling + 0.25); fastWindows = 0; }
      else if (fps <= 57) fastWindows = 0;
      elapsed = 0; frames = 0; apply();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(pending); clearTimeout(timer);
      renderer?.domElement.removeEventListener('pointerdown', down);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    },
  };
}
