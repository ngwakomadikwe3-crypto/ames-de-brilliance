// Real stones for the live camera try-ons: the same closed-volume ray tracing the Boutique viewer and the tile
// posters use (ames-engine's PhysicalStudioGem: total internal reflection, the viewer's head shadow that gives a
// cut stone its black-and-white contrast, fire on diamonds), lit by the camera's own HDR room. Applied to the
// piece's hero stones (centre stones, drops, links); the pavé keeps its instanced stones.
import { BufferAttribute, BufferGeometry, Matrix4, Vector3, type Mesh, type MeshPhysicalMaterial, type Object3D, type Texture } from 'three';
import { createPhysicalStudioGem } from '../../../node_modules/ames-engine/src/engine/materials/PhysicalStudioGem';
import { createStripStudioEnvironment } from '../../../node_modules/ames-engine/src/engine/renderer/createStripStudioEnvironment';
import type { WebGLRenderer } from 'three';

/**
 * The stones' light: a jeweller's light tent (overhead softbox, strip lights, black flags; the same tent as the
 * Boutique's posters) and its HDR. A real stone's sparkle comes from small hard lights and dark surroundings that
 * a front camera never sees; lit only by the camera picture, stones go grey and milky. The metal keeps the
 * room's own light, so the piece still sits in the customer's room.
 */
export async function stoneLight(renderer: WebGLRenderer) {
  const tent = createStripStudioEnvironment(renderer, 0.12, 'gem'), metal = createStripStudioEnvironment(renderer, 0.3, 'metal');
  const { HDRLoader } = await import('three/examples/jsm/loaders/HDRLoader.js');
  const radiance = await new HDRLoader().loadAsync('/ames-engine/environments/jewellery-tent-v3.hdr');
  const { EquirectangularReflectionMapping } = await import('three');
  radiance.mapping = EquirectangularReflectionMapping;
  return { environment: tent.texture, metal: metal.texture, radiance, dispose() { tent.dispose(); metal.dispose(); radiance.dispose(); } };
}

export type RealGems = { materials: MeshPhysicalMaterial[]; setEnvironment(env: Texture): void; dispose(): void };

/** maxStones: the largest stones get the tracing (phones: fewer). Call once the piece sits at its worn size. */
export function realGems(piece: Object3D, environment: Texture, radiance: Texture, maxStones = 40, metalEnvironment?: Texture): RealGems {
  const candidates: { mesh: Mesh; size: number }[] = [];
  piece.updateMatrixWorld(true);
  piece.traverse(o => {
    const mesh = o as Mesh & { isInstancedMesh?: boolean };
    if (!mesh.isMesh || mesh.isInstancedMesh || !mesh.visible) return;
    const data = mesh.userData ?? {};
    if (!data.ames_gemstone_id || data.ames_pave_layout) return;
    if (data.ames_optical_mode && data.ames_optical_mode !== 'closed-dielectric-visual') return;   // pearls, opaque stones
    mesh.geometry.computeBoundingBox();
    candidates.push({ mesh, size: mesh.geometry.boundingBox!.getSize(new Vector3()).length() * mesh.getWorldScale(new Vector3()).length() });
  });
  candidates.sort((a, b) => b.size - a.size);
  const materials: MeshPhysicalMaterial[] = [], geometries: BufferGeometry[] = [];
  for (const { mesh } of candidates.slice(0, maxStones)) {
    // Expand quantized / interleaved attributes and centre the stone at unit size for the optical BVH (as the
    // posters do), moving the mesh so it stays exactly where it was.
    const geometry = new BufferGeometry();
    for (const [name, attribute] of Object.entries(mesh.geometry.attributes)) {
      const values = new Float32Array(attribute.count * attribute.itemSize);
      for (let i = 0; i < attribute.count; i++) for (let k = 0; k < attribute.itemSize; k++) values[i * attribute.itemSize + k] = attribute.getComponent(i, k);
      geometry.setAttribute(name, new BufferAttribute(values, attribute.itemSize));
    }
    if (mesh.geometry.index) geometry.setIndex(Array.from(mesh.geometry.index.array));
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!, centre = box.getCenter(new Vector3()), scale = box.getSize(new Vector3()).length();
    if (!Number.isFinite(scale) || scale <= 0) continue;
    geometry.translate(-centre.x, -centre.y, -centre.z).scale(1 / scale, 1 / scale, 1 / scale);
    mesh.geometry = geometry; geometries.push(geometry);
    mesh.updateMatrix();
    mesh.matrix.multiply(new Matrix4().makeTranslation(centre.x, centre.y, centre.z)).multiply(new Matrix4().makeScale(scale, scale, scale));
    mesh.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
    mesh.updateMatrixWorld(true);
    const id = String(mesh.userData.ames_gemstone_id);
    const material = createPhysicalStudioGem(geometry, id, mesh.material as MeshPhysicalMaterial, environment, radiance, mesh.getWorldScale(new Vector3()).y);
    mesh.material = material; materials.push(material);
  }
  // polished metal: the photographer's tent too (bright and dark bands that show a polished surface's shape);
  // the room's key light still colours it
  if (metalEnvironment) piece.traverse(o => { const m = o as Mesh; if (!m.isMesh || m.userData?.ames_gemstone_id) return;
    const mat = m.material as MeshPhysicalMaterial; if (mat && mat.metalness > 0.5) { mat.envMap = metalEnvironment; mat.envMapIntensity = 1.1; mat.needsUpdate = true; } });
  // the small pavé stones (instanced) take the same tent
  piece.traverse(o => { const m = o as Mesh & { isInstancedMesh?: boolean }; if (m.isInstancedMesh) { const mat = m.material as MeshPhysicalMaterial; if (mat && 'envMap' in mat) { mat.envMap = environment; mat.needsUpdate = true; } } });
  return {
    materials,
    setEnvironment(env) { for (const m of materials) { m.envMap = env; } },
    dispose() { materials.forEach(m => m.dispose()); geometries.forEach(g => g.dispose()); },
  };
}
