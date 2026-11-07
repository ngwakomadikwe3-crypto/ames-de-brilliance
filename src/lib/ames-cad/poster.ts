// Browser: render the converted piece to the Boutique tile image (transparent WebP).
import { ACESFilmicToneMapping, Box3, Color, EquirectangularReflectionMapping, Group, Mesh, MeshPhysicalMaterial, PerspectiveCamera, PMREMGenerator, Scene, ShaderMaterial, Vector3, WebGLRenderer, type Texture } from 'three';
import type { Category } from './classify';
import { gem } from './gems';
import { createStudioBrilliantGeometry } from '../../../node_modules/ames-engine/src/engine/jewelry/createStudioBrilliantGeometry';
import { createPaveFromLayout } from '../../../node_modules/ames-engine/src/engine/jewelry/createPaveFromLayout';

const VIEWS: Record<Category, [number, number]> = { ring: [30, 58], earrings: [8, 86], necklace: [6, 84], bracelet: [25, 50], watch: [-20, 76], accessory: [18, 70] };

/** A fast diamond look for stills: facet reflections plus light returned through the pavilion. */
function stillDiamond(env: Texture, axis: Vector3, id = 'stone-diamond'): ShaderMaterial {
  const g = gem(id), white = id === 'stone-diamond';
  // Coloured stones: the body colour deepens the light returned through the stone.
  const tint = white ? new Vector3(1, 1, 1) : new Vector3(...g.color.map(v => Math.min(1, v * 1.12 + 0.01)));
  return new ShaderMaterial({
    uniforms: { envTex: { value: env }, axis: { value: axis }, seed: { value: Math.random() * 10 }, tint: { value: tint }, ior: { value: g.ior ?? 1.6 }, spread: { value: white || id === 'stone-fancy-color-diamond' ? 0.03 : 0.01 } },
    vertexShader: 'varying vec3 wp; void main(){ vec4 w = modelMatrix * vec4(position,1.); wp = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform sampler2D envTex; uniform vec3 axis; uniform float seed; uniform vec3 tint; uniform float ior; uniform float spread; varying vec3 wp;
      vec3 env(vec3 d){ vec2 uv = vec2(atan(d.z, d.x) / 6.2831853 + .5, asin(clamp(d.y,-1.,1.)) / 3.14159265 + .5); return texture2D(envTex, uv).rgb; }
      vec3 body(vec3 t, vec3 j, float k){ vec3 o = reflect(t, normalize(-axis + j*k)); o = reflect(o, normalize(-axis + j.zxy*k)); return normalize(o + axis*.9); }
      void main(){ vec3 N = normalize(cross(dFdx(wp), dFdy(wp))); vec3 I = normalize(wp - cameraPosition); if (dot(N,I) > 0.) N = -N;
        float f0 = pow((ior-1.)/(ior+1.), 2.); float F = f0 + (1.-f0)*pow(1. - max(dot(-I,N),0.), 5.); F = max(F, f0 + .04);
        vec3 q = floor(N*24.+.5)/24. + seed;
        vec3 j = fract(sin(vec3(dot(q,vec3(12.9,78.2,37.7)), dot(q,vec3(39.3,11.1,83.9)), dot(q,vec3(73.1,52.3,9.7))))*43758.5) - .5;
        vec3 t = refract(I, N, 1./ior);
        vec3 b = vec3(env(body(t,j,1.08-spread)).r, env(body(t,j,1.08)).g, env(body(t,j,1.08+spread)).b);
        gl_FragColor = vec4(mix(b * 1.25 * tint, env(reflect(I,N)), F), 1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }` });
}

export async function renderPoster(glb: Uint8Array, category: Category, size = 900): Promise<Blob> {
  const [{ GLTFLoader }, { MeshoptDecoder }, { HDRLoader }] = await Promise.all([
    import('three/examples/jsm/loaders/GLTFLoader.js'), import('three/examples/jsm/libs/meshopt_decoder.module.js'), import('three/examples/jsm/loaders/HDRLoader.js')]);
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  try {
    renderer.setSize(size, size, false); renderer.toneMapping = ACESFilmicToneMapping; renderer.setClearColor(0x000000, 0);
    const hdr = await new HDRLoader().loadAsync('/ames-engine/environments/jewellery-tent-v2.hdr'); hdr.mapping = EquirectangularReflectionMapping;
    const pmrem = new PMREMGenerator(renderer), envMap = pmrem.fromEquirectangular(hdr).texture, scene = new Scene(); scene.environment = envMap;
    const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(glb.slice().buffer, '');
    const root = gltf.scene, pivot = new Group(); pivot.add(root); scene.add(pivot); root.updateMatrixWorld(true);
    const cuts = new Map<string, ReturnType<typeof createStudioBrilliantGeometry>>();
    root.traverse(o => {
      const mesh = o as Mesh; if (!mesh.isMesh) return; const data = mesh.userData as { ames_cut?: string; ames_pave_layout?: string; ames_optical_mode?: string; ames_gemstone_id?: string };
      const id = String(data.ames_gemstone_id || 'stone-diamond');
      // Pearls, cabochons and opaque stones: a polished surface in the stone's own colour.
      if (data.ames_gemstone_id && data.ames_optical_mode !== 'closed-dielectric-visual') { const g = gem(id); mesh.material = new MeshPhysicalMaterial({ color: new Color(...g.color), roughness: g.roughness, clearcoat: 0.7, clearcoatRoughness: 0.08, sheen: g.mode === 'nacre-visual' ? 0.6 : 0, envMapIntensity: 1.4 }); return; }
      if (data.ames_optical_mode !== 'closed-dielectric-visual') { const m = mesh.material as MeshPhysicalMaterial; mesh.material = new MeshPhysicalMaterial({ color: m.color, metalness: m.metalness, roughness: Math.max(0.04, m.roughness) }); return; }
      if (data.ames_pave_layout) { mesh.updateMatrix(); mesh.geometry = createPaveFromLayout(data.ames_pave_layout, mesh.matrix.clone().invert()); }
      else if (data.ames_cut) {
        mesh.geometry.computeBoundingBox(); const b = mesh.geometry.boundingBox!, s = b.getSize(new Vector3()), c = b.getCenter(new Vector3());
        const cut = data.ames_cut as NonNullable<Parameters<typeof createStudioBrilliantGeometry>[0]>;
        if (!cuts.has(cut)) cuts.set(cut, createStudioBrilliantGeometry(cut));
        const g = cuts.get(cut)!.clone(); g.computeBoundingBox(); const ob = g.boundingBox!, os = ob.getSize(new Vector3()), oc = ob.getCenter(new Vector3());
        g.translate(-oc.x, -oc.y, -oc.z); g.scale(s.x / os.x, s.y / os.y, s.z / os.z); g.translate(c.x, c.y, c.z); mesh.geometry = g;
      }
      const axis = new Vector3(0, 1, 0).transformDirection(mesh.matrixWorld);
      mesh.material = stillDiamond(hdr, data.ames_pave_layout ? new Vector3(0, 1, 0) : axis, id);
    });
    const box = new Box3().setFromObject(root), center = box.getCenter(new Vector3()), fit = 2.6 / Math.max(...box.getSize(new Vector3()).toArray());
    root.position.sub(center); pivot.scale.setScalar(fit);
    const [theta, phi] = VIEWS[category], camera = new PerspectiveCamera(30, 1, 0.01, 100);
    camera.position.setFromSphericalCoords(5.4, phi * Math.PI / 180, theta * Math.PI / 180); camera.lookAt(0, 0, 0);
    // Frame tightly: refit the distance so the piece fills ~85% of the image.
    const corners = [0, 1, 2, 3, 4, 5, 6, 7].map(i => new Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(center).multiplyScalar(fit));
    camera.updateMatrixWorld(); const spread = Math.max(...corners.map(p => { const v = p.clone().project(camera); return Math.max(Math.abs(v.x), Math.abs(v.y)); }));
    camera.position.multiplyScalar(spread / 0.85); camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
    // Crop to the visible piece and centre it with a small margin.
    const gl = renderer.getContext(), pixels = new Uint8Array(size * size * 4);
    gl.readPixels(0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let x0 = size, y0 = size, x1 = -1, y1 = -1;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (pixels[(y * size + x) * 4 + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const out = document.createElement('canvas'); out.width = out.height = size;
    if (x1 >= x0) {
      const w = x1 - x0 + 1, h = y1 - y0 + 1, side = Math.max(w, h) * 1.1, k = size / side;
      out.getContext('2d')!.drawImage(canvas, x0, size - 1 - y1, w, h, (size - w * k) / 2, (size - h * k) / 2, w * k, h * k);
    }
    return await new Promise<Blob>((resolve, reject) => out.toBlob(b => b ? resolve(b) : reject(new Error('Could not create the product image')), 'image/webp', 0.9));
  } finally { renderer.dispose(); renderer.forceContextLoss(); }
}
