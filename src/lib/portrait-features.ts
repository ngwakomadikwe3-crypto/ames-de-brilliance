// LOCKED (approved in review): the wispy brows and the upper/lower lashes of the face twin. Every view that shows the
// twin's skin builds them through this one function, on top of the skin layers (A, A+B, A+B+C), so they cannot be
// dropped by a view or a layer switch. Do not rebuild them elsewhere; change them only here, and keep
// `npm run test:portrait-features` passing.
import { Color, Matrix3, Matrix4, Vector3, type Mesh, type Object3D } from 'three';
import { SkinField, growBrows, growLashes } from './portrait-grooming';
import type { P3 } from './face-morph';

export const FEATURE_NAMES = { brows: 'twin features: brows', lashes: 'twin features: lashes' } as const;

/** Grow the brows and lashes for the skin as it is now (points and landmarks in the frame's mm), following expressions. */
export function growFeatures(skin: Mesh, frame: Object3D, pts: P3[], lm: P3[], eyes: { left: P3; right: P3 }, hairColor: Color) {
  frame.updateMatrixWorld(true);
  const nrm = skin.geometry.getAttribute('normal'), toFrame = new Matrix4().copy(frame.matrixWorld).invert().multiply(skin.matrixWorld), N3 = new Matrix3().setFromMatrix4(toFrame);
  const normals: P3[] = []; for (let i = 0; i < nrm.count; i++) { const v = new Vector3(nrm.getX(i), nrm.getY(i), nrm.getZ(i)).applyMatrix3(N3).normalize(); normals.push([v.x, v.y, v.z]); }
  const field = new SkinField(pts, normals), dict = skin.morphTargetDictionary ?? {}, morph = skin.geometry.morphAttributes.position ?? [];
  const delta = (i: number, name: string) => { const at = dict[name]; return at === undefined ? new Vector3() : new Vector3().fromBufferAttribute(morph[at], i).applyMatrix3(N3); };
  const brows = growBrows(field, lm, hairColor.clone().multiplyScalar(0.8), 1, i => [delta(i, 'ex:brows-soft'), delta(i, 'ex:brows-up')]);
  const lashes = growLashes(lm, new Color('#120c09'), eyes, field, i => [delta(i, 'ex:blink-l'), delta(i, 'ex:blink-r')]);
  brows.name = FEATURE_NAMES.brows; lashes.name = FEATURE_NAMES.lashes;
  brows.renderOrder = lashes.renderOrder = 4;                              // drawn over the skin, whatever its layer
  frame.add(brows, lashes);
  return { brows, lashes, field, normals };
}
export function disposeFeatures(f: { brows: Mesh; lashes: Mesh } | null) {
  for (const m of f ? [f.brows, f.lashes] : []) { m.removeFromParent(); m.geometry.dispose(); (m.material as { dispose(): void }).dispose(); }
}
