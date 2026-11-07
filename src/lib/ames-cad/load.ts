// Browser loaders: read a jeweller's CAD file into world-space triangle parts (mm).
import { Box3, Color, Mesh, type Material, type Object3D } from 'three';
import type { SourcePart, Vec3 } from './geometry';
import { guessUnitScale } from './geometry';

export type Units = 'auto' | 'mm' | 'cm' | 'm' | 'in';
const FACTOR = { mm: 1, cm: 10, m: 1000, in: 25.4 } as const;
export const CAD_EXTENSIONS = ['3dm', 'glb', 'gltf', 'obj', 'stl', 'ply', 'fbx'] as const;
/** Rhino UnitSystem enum values that matter for jewellery. */
const RHINO_UNITS: Record<string, keyof typeof FACTOR> = { 2: 'mm', 3: 'cm', 4: 'm', 8: 'in', Millimeters: 'mm', Centimeters: 'cm', Meters: 'm', Inches: 'in' };
/** Rhino's file reader (rhino3dm 8.4.0), served by AMES itself so Rhino files open without outside sites. */
const RHINO3DM = '/vendor/rhino3dm/';

async function readObject(file: File): Promise<{ object: Object3D; declared?: keyof typeof FACTOR }> {
  const ext = file.name.split('.').pop()?.toLowerCase() || '', bytes = await file.arrayBuffer();
  if (ext === 'glb' || ext === 'gltf') {
    const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([import('three/examples/jsm/loaders/GLTFLoader.js'), import('three/examples/jsm/libs/meshopt_decoder.module.js')]);
    const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes, '');
    return { object: gltf.scene, declared: 'm' }; // glTF is metres by definition
  }
  if (ext === 'obj') { const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js'); return { object: new OBJLoader().parse(new TextDecoder().decode(bytes)) }; }
  if (ext === 'stl') {
    const { STLLoader } = await import('three/examples/jsm/loaders/STLLoader.js');
    const geometry = new STLLoader().parse(bytes), mesh = new Mesh(geometry); mesh.name = file.name.replace(/\.stl$/i, ''); mesh.userData.ames_file_name = true; // the file name describes the piece, not a stone
    return { object: mesh };
  }
  if (ext === 'ply') {
    // Stone scanners (Sarine, Helium and others) commonly export PLY meshes.
    const { PLYLoader } = await import('three/examples/jsm/loaders/PLYLoader.js');
    const mesh = new Mesh(new PLYLoader().parse(bytes)); mesh.name = file.name.replace(/\.ply$/i, ''); mesh.userData.ames_file_name = true;
    return { object: mesh };
  }
  if (ext === 'fbx') { const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js'); return { object: new FBXLoader().parse(bytes, '') }; }
  if (ext === '3dm') {
    const { Rhino3dmLoader } = await import('three/examples/jsm/loaders/3DMLoader.js');
    const loader = new Rhino3dmLoader().setLibraryPath(RHINO3DM);
    const object = await new Promise<Object3D>((resolve, reject) => loader.parse(bytes, resolve, reject));
    loader.dispose();
    const settings = (object.userData as { settings?: { modelUnitSystem?: { value?: number; name?: string } | number | string } }).settings;
    const unit = typeof settings?.modelUnitSystem === 'object' ? settings.modelUnitSystem.value ?? settings.modelUnitSystem.name : settings?.modelUnitSystem;
    return { object, declared: RHINO_UNITS[String(unit)] };
  }
  throw new Error('Upload a .3dm, .glb, .gltf, .obj, .stl, .ply or .fbx file.');
}

function colorOf(material: Material | Material[] | undefined): Vec3 | null {
  const m = Array.isArray(material) ? material[0] : material;
  const c = (m as { color?: Color } | undefined)?.color; return c ? [c.r, c.g, c.b] : null;
}

/** Read the file and flatten every mesh into world-space triangles in millimetres. */
export async function loadCad(file: File, units: Units = 'auto') {
  const { object, declared } = await readObject(file);
  object.updateMatrixWorld(true);
  const box = new Box3().setFromObject(object), size = box.getSize(box.min.clone());
  const largest = Math.max(size.x, size.y, size.z);
  if (!Number.isFinite(largest) || largest <= 0) throw new Error('No 3D surfaces were found. If this is a Rhino file, save it with render meshes (turn off “Save small”), or export a GLB.');
  const guess = guessUnitScale(largest), unit = units !== 'auto' ? units : declared || guess.unit, factor = FACTOR[unit];
  const layers = ((object.userData as { layers?: { name?: string }[] }).layers || []).map(l => l.name || '');
  const parts: SourcePart[] = [];
  object.traverse(child => {
    const mesh = child as Mesh; if (!mesh.isMesh || !mesh.visible || !mesh.geometry?.getAttribute('position')) return; // hidden Rhino layers stay out
    const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    g.applyMatrix4(mesh.matrixWorld); g.scale(factor, factor, factor);
    // Read through the accessor: glTF data may be interleaved or quantised.
    const attr = g.getAttribute('position'), positions = new Float32Array(attr.count * 3);
    for (let i = 0; i < attr.count; i++) { positions[i * 3] = attr.getX(i); positions[i * 3 + 1] = attr.getY(i); positions[i * 3 + 2] = attr.getZ(i); }
    // Textured surfaces (enamel, dials, leather): keep the image and where it sits on the surface.
    const source = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as { map?: { image?: unknown } | null } | undefined;
    const uvAttr = g.getAttribute('uv'); let uv: Float32Array | undefined, map: unknown;
    if (source?.map?.image && uvAttr) { uv = new Float32Array(uvAttr.count * 2); for (let i = 0; i < uvAttr.count; i++) { uv[i * 2] = uvAttr.getX(i); uv[i * 2 + 1] = uvAttr.getY(i); } map = source.map; }
    g.dispose();
    const attrs = (mesh.userData as { attributes?: { layerIndex?: number; name?: string } }).attributes;
    const layer = attrs?.layerIndex != null ? layers[attrs.layerIndex] || '' : '';
    const materialName = (Array.isArray(mesh.material) ? mesh.material.map(m => m.name) : [mesh.material?.name]).join(' ');
    const names = [mesh.name, mesh.parent?.name, attrs?.name, layer, materialName].filter(Boolean);
    const own = [mesh.userData.ames_file_name ? '' : mesh.name, attrs?.name, layer, materialName].filter(Boolean).join(' ');
    parts.push({ name: mesh.name || attrs?.name || layer || 'Part', hint: names.join(' '), own, color: colorOf(mesh.material), positions, uv, map });
  });
  if (!parts.length) throw new Error('This file has no meshes the converter can read. Export a mesh (GLB, OBJ or STL) from your CAD program.');
  return { parts, unit, unitSource: units !== 'auto' ? 'chosen' : declared ? 'declared in the file' : 'estimated from the size', names: [file.name, ...parts.map(p => p.hint)].join(' ') };
}
