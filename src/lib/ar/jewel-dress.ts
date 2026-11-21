import { Color, DoubleSide, InstancedMesh, Matrix4, Mesh, MeshPhysicalMaterial, Quaternion, Vector3, type Material, type MeshStandardMaterial, type Object3D } from 'three';
import { brilliantGeometry } from './brilliant';
// Jewellery materials for live views: stones refract with fire, polished metal, see-through watch glass, and the
// pavé the models store as a layout set as instanced stones.
/** metalEnv: an environment for polished metal only (e.g. the softbox studio); stones keep the scene's. */
export function dress(piece: Object3D, metalEnv?: import('three').Texture) {
  const gems: MeshPhysicalMaterial[] = [];
  const stone = (from: Material | Material[]) => {
    const src = (Array.isArray(from) ? from[0] : from) as MeshPhysicalMaterial;
    const m = src instanceof MeshPhysicalMaterial ? src.clone() : new MeshPhysicalMaterial({ color: (src as MeshStandardMaterial).color ?? new Color('#fff') });
    m.metalness = 0; m.roughness = 0; m.transmission = 1; m.ior = m.ior > 1.6 ? m.ior : 2.417;
    m.dispersion = 0.6; m.specularIntensity = 1; m.envMapIntensity = 1.8; m.side = DoubleSide;
    // Thin-walled refraction: tint coloured stones through their base colour, never by absorption depth (which
    // depends on scale and turns small stones black).
    if (m.attenuationColor && m.attenuationColor.getHex() !== 0xffffff) m.color.copy(m.attenuationColor).lerp(new Color('#ffffff'), 0.25);
    m.attenuationDistance = Infinity; m.thickness = 0;
    gems.push(m); return m;
  };
  const brilliant = brilliantGeometry();
  const pave: Mesh[] = [];
  piece.traverse(o => {
    const mesh = o as Mesh; if (!mesh.isMesh) return;
    const data = mesh.userData ?? {};
    if (data.ames_gemstone_id || /diamond|sapphire|gem/i.test(String((mesh.material as Material).name))) mesh.material = stone(mesh.material);
    else if (data.ames_glass) { const g = (mesh.material as MeshStandardMaterial).clone(); g.transparent = true; g.opacity = 0.12; g.depthWrite = false; mesh.material = g; }
    else {
      const m = (mesh.material as MeshStandardMaterial).clone();
      // Split by finish: polished 0.06-0.15, brushed/satin 0.3-0.45, all fully metallic.
      if (m.metalness > 0.5) {
        m.metalness = 1; m.envMapIntensity = 1.25;
        m.roughness = /brushed|satin|matte/i.test(m.name) ? Math.min(0.45, Math.max(0.3, m.roughness)) : Math.min(0.15, Math.max(0.06, m.roughness));
        if (metalEnv) m.envMap = metalEnv;
      }
      mesh.material = m;
    }
    if (typeof data.ames_pave_layout === 'string') pave.push(mesh);
  });
  // Pavé is stored as a layout (position, rotation, size per stone); set each stone as an instance.
  for (const mesh of pave) {
    const bytes = Uint8Array.from(atob(mesh.userData.ames_pave_layout), c => c.charCodeAt(0));
    const rec = new Float32Array(bytes.buffer, 0, Math.floor(bytes.length / 4));
    const count = Math.floor(rec.length / 8);
    const inst = new InstancedMesh(brilliant, mesh.material as Material, count);
    const m = new Matrix4(), q = new Quaternion(), p = new Vector3(), s = new Vector3();
    for (let i = 0; i < count; i++) {
      const r = i * 8;
      p.set(rec[r], rec[r + 1], rec[r + 2]); q.set(rec[r + 3], rec[r + 4], rec[r + 5], rec[r + 6]); s.setScalar(rec[r + 7] / 2);
      inst.setMatrixAt(i, m.compose(p, q, s));
    }
    inst.instanceMatrix.needsUpdate = true;
    mesh.parent?.add(inst); mesh.visible = false;
  }
  return gems;
}

