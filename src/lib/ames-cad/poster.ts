// Browser: render the converted piece to the Boutique tile image (transparent WebP).
import { NeutralToneMapping, BufferAttribute, BufferGeometry, Matrix4, Box3, Color, EquirectangularReflectionMapping, Group, Mesh, MeshPhysicalMaterial, PerspectiveCamera, PMREMGenerator, Scene, Vector3, WebGLRenderer } from 'three';
import type { Category } from './classify';
import { gem } from './gems';
import { createStudioBrilliantGeometry } from '../../../node_modules/ames-engine/src/engine/jewelry/createStudioBrilliantGeometry';
import { createPaveFromLayout } from '../../../node_modules/ames-engine/src/engine/jewelry/createPaveFromLayout';

const VIEWS: Record<Category, [number, number]> = { ring: [30, 58], earrings: [8, 86], necklace: [6, 84], bracelet: [25, 50], watch: [-20, 76], accessory: [18, 70] };

// Use the same closed-volume ray tracing as the interactive viewer. Poster sparkle
// must follow the actual facets rather than a random normal-based approximation.
import { createPhysicalStudioGem } from '../../../node_modules/ames-engine/src/engine/materials/PhysicalStudioGem';
import { createStripStudioEnvironment } from '../../../node_modules/ames-engine/src/engine/renderer/createStripStudioEnvironment';

export async function renderPoster(glb: Uint8Array, category: Category, size = 900, view?: [number, number]): Promise<Blob> {
  const [{ GLTFLoader }, { MeshoptDecoder }, { HDRLoader }] = await Promise.all([
    import('three/examples/jsm/loaders/GLTFLoader.js'), import('three/examples/jsm/libs/meshopt_decoder.module.js'), import('three/examples/jsm/loaders/HDRLoader.js')]);
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  const dispose: (() => void)[] = [];
  try {
    renderer.setSize(size, size, false); renderer.toneMapping = NeutralToneMapping; renderer.setClearColor(0x000000, 0);
    const hdr = await new HDRLoader().loadAsync('/ames-engine/environments/jewellery-tent-v3.hdr'); hdr.mapping = EquirectangularReflectionMapping;
    const pmrem = new PMREMGenerator(renderer), envMap = pmrem.fromEquirectangular(hdr).texture, scene = new Scene(); scene.environment = envMap;
    const metalStudio = createStripStudioEnvironment(renderer), diamondStudio = createStripStudioEnvironment(renderer, 0.12);
    dispose.push(() => hdr.dispose(), () => envMap.dispose(), () => pmrem.dispose(), () => metalStudio.dispose(), () => diamondStudio.dispose());
    const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(glb.slice().buffer, '');
    const root = gltf.scene, pivot = new Group(); pivot.add(root); scene.add(pivot); root.updateMatrixWorld(true);
    const cuts = new Map<string, ReturnType<typeof createStudioBrilliantGeometry>>();
    const volumeMeshes: Mesh[] = [];
    root.traverse(o => {
      const mesh = o as Mesh; if (!mesh.isMesh) return; const data = mesh.userData as { ames_cut?: string; ames_pave_layout?: string; ames_optical_mode?: string; ames_gemstone_id?: string; ames_rough?: boolean };
      // Rough crystals: frosted, light passing through the skin.
      if (data.ames_rough) { const m = mesh.material as MeshPhysicalMaterial; mesh.geometry.computeVertexNormals(); mesh.material = new MeshPhysicalMaterial({ color: m.color.clone().multiplyScalar(0.16), roughness: 0.2, metalness: 0, ior: m.ior || 2.4, specularIntensity: 1, clearcoat: 0.7, clearcoatRoughness: 0.28, envMapIntensity: 1.1 }); return; }
      const id = String(data.ames_gemstone_id || 'stone-diamond');
      // Pearls, cabochons and opaque stones: a polished surface in the stone's own colour.
      if (data.ames_gemstone_id && data.ames_optical_mode !== 'closed-dielectric-visual') { const g = gem(id); mesh.material = new MeshPhysicalMaterial({ color: new Color(...g.color), roughness: g.roughness, clearcoat: 0.7, clearcoatRoughness: 0.08, sheen: g.mode === 'nacre-visual' ? 0.6 : 0, envMapIntensity: 1.4 }); return; }
      if (data.ames_optical_mode !== 'closed-dielectric-visual') { const m = mesh.material as MeshPhysicalMaterial; mesh.material = new MeshPhysicalMaterial({ color: m.color, map: m.map, metalness: m.metalness, roughness: Math.max(0.06, m.roughness), envMap: m.metalness > 0.9 ? metalStudio.texture : envMap }); return; }
      if (data.ames_pave_layout) { mesh.updateMatrix(); mesh.geometry = createPaveFromLayout(data.ames_pave_layout, mesh.matrix.clone().invert()); }
      else if (data.ames_cut) {
        mesh.geometry.computeBoundingBox(); const b = mesh.geometry.boundingBox!, s = b.getSize(new Vector3()), c = b.getCenter(new Vector3());
        const cut = data.ames_cut as NonNullable<Parameters<typeof createStudioBrilliantGeometry>[0]>;
        if (!cuts.has(cut)) cuts.set(cut, createStudioBrilliantGeometry(cut));
        const g = cuts.get(cut)!.clone(); g.computeBoundingBox(); const ob = g.boundingBox!, os = ob.getSize(new Vector3()), oc = ob.getCenter(new Vector3());
        g.translate(-oc.x, -oc.y, -oc.z); g.scale(s.x / os.x, s.y / os.y, s.z / os.z); g.translate(c.x, c.y, c.z); mesh.geometry = g;
      }
      // Expand quantized/interleaved CAD attributes before building the optical BVH.
      const geometry = new BufferGeometry();
      for (const [name, attribute] of Object.entries(mesh.geometry.attributes)) {
        const values = new Float32Array(attribute.count * attribute.itemSize);
        for (let i = 0; i < attribute.count; i++) for (let k = 0; k < attribute.itemSize; k++) values[i * attribute.itemSize + k] = attribute.getComponent(i, k);
        geometry.setAttribute(name, new BufferAttribute(values, attribute.itemSize));
      }
      if (mesh.geometry.index) geometry.setIndex(Array.from(mesh.geometry.index.array));
      geometry.computeBoundingBox();
      const bounds = geometry.boundingBox!, center = bounds.getCenter(new Vector3()), scale = bounds.getSize(new Vector3()).length();
      if (!Number.isFinite(scale) || scale <= 0) throw new Error('Invalid gemstone volume');
      geometry.translate(-center.x, -center.y, -center.z).scale(1 / scale, 1 / scale, 1 / scale);
      mesh.geometry = geometry;
      mesh.updateMatrix();
      mesh.matrix.multiply(new Matrix4().makeTranslation(center)).multiply(new Matrix4().makeScale(scale, scale, scale));
      mesh.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
      volumeMeshes.push(mesh);
    });
    const box = new Box3().setFromObject(root), center = box.getCenter(new Vector3()), fit = 2.6 / Math.max(...box.getSize(new Vector3()).toArray());
    root.position.sub(center); pivot.scale.setScalar(fit);
    pivot.updateMatrixWorld(true);
    for (const mesh of volumeMeshes) {
      const id = String(mesh.userData.ames_gemstone_id || 'stone-diamond');
      const material = createPhysicalStudioGem(mesh.geometry, id, mesh.material as MeshPhysicalMaterial,
        id.includes('diamond') ? diamondStudio.texture : envMap, hdr, mesh.getWorldScale(new Vector3()).y, mesh.userData.ames_pave === true);
      mesh.material = material;
      dispose.push(() => material.dispose(), () => mesh.geometry.dispose());
    }
    const [theta, phi] = view || VIEWS[category], camera = new PerspectiveCamera(30, 1, 0.01, 100);
    camera.position.setFromSphericalCoords(5.4, phi * Math.PI / 180, theta * Math.PI / 180); camera.lookAt(0, 0, 0);
    // Frame tightly: refit the distance so the piece fills ~85% of the image.
    const corners = [0, 1, 2, 3, 4, 5, 6, 7].map(i => new Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(center).multiplyScalar(fit));
    camera.updateMatrixWorld(); const spread = Math.max(...corners.map(p => { const v = p.clone().project(camera); return Math.max(Math.abs(v.x), Math.abs(v.y)); }));
    camera.position.multiplyScalar(spread / 0.85); camera.lookAt(0, 0, 0);
    await renderer.compileAsync(scene, camera);
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
  } finally { for (const release of dispose) release(); renderer.dispose(); renderer.forceContextLoss(); }
}
