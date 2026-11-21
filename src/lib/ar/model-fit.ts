import { Box3, InstancedMesh, Matrix4, Mesh, Object3D, Vector3 } from 'three';
// Measure a ring, bracelet or watch model so it can be worn: the axis it encircles, which way is "up" (the head,
// or the watch case), the centre of its bore and the bore's inner semi-axes, all in the model's own units.
export type LoopFit = { axis: Vector3; up: Vector3; side: Vector3; centre: Vector3; innerUp: number; innerSide: number; width: number };

function samples(root: Object3D, budget = 60000) {
  const out: Vector3[] = [];
  root.updateMatrixWorld(true);
  const inverse = new Matrix4().copy(root.matrixWorld).invert();
  let total = 0;
  const usable = (o: Object3D) => (o as Mesh).isMesh && !(o as InstancedMesh).isInstancedMesh;
  root.traverse(o => { const g = (o as Mesh).geometry; if (usable(o) && g?.attributes?.position) total += g.attributes.position.count; });
  const step = Math.max(1, Math.ceil(total / budget));
  root.traverse(o => {
    const m = o as Mesh; const pos = usable(o) ? m.geometry?.attributes?.position : undefined;
    if (!pos) return;
    const toRoot = new Matrix4().multiplyMatrices(inverse, m.matrixWorld);
    for (let i = 0; i < pos.count; i += step) out.push(new Vector3().fromBufferAttribute(pos, i).applyMatrix4(toRoot));
  });
  return out;
}

const AXES = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)];
const percentile = (values: number[], q: number) => { if (!values.length) return 0; values.sort((a, b) => a - b); return values[Math.min(values.length - 1, Math.floor(values.length * q))]; };

/** hint: a point (model space) on the "up" side, e.g. the watch head; or below, e.g. the clasp. */
export function fitLoop(root: Object3D, hint?: { up?: Vector3; down?: Vector3 }): LoopFit {
  const pts = samples(root);
  const box = new Box3().setFromPoints(pts), size = box.getSize(new Vector3()), mid = box.getCenter(new Vector3());
  const dims = [size.x, size.y, size.z];
  const k = dims.indexOf(Math.min(...dims));
  const axis = AXES[k].clone();
  const plane = AXES.filter((_, i) => i !== k);
  let up: Vector3;
  if (hint?.up) up = hint.up.clone().sub(mid).projectOnPlane(axis).normalize();
  else if (hint?.down) up = mid.clone().sub(hint.down).projectOnPlane(axis).normalize();
  else {
    // The heavier side of the outline (a ring's head) is up.
    // Pieces are authored round their bore: the end that reaches further from the origin (a ring's head) is up.
    const offsets = plane.map(a => { const lo = box.min.dot(a), hi = box.max.dot(a); return { a, skew: hi + lo, span: hi - lo }; });
    const best = offsets.reduce((x, y) => Math.abs(y.skew) / y.span > Math.abs(x.skew) / x.span ? y : x);
    up = best.a.clone().multiplyScalar(best.skew >= 0 ? 1 : -1);
  }
  if (!Number.isFinite(up.x) || up.lengthSq() < 0.5) up = plane[0].clone();
  const side = new Vector3().crossVectors(axis, up).normalize();
  // Bore: nearest metal straight out from the centre in four directions (3rd percentile rejects stray prongs).
  const centre = mid.clone();
  let inner = { up: 0, down: 0, left: 0, right: 0 };
  for (let pass = 0; pass < 3; pass++) {
    const reach = (dir: Vector3) => {
      const d: number[] = [];
      for (const p of pts) {
        const r = p.clone().sub(centre).projectOnPlane(axis), len = r.length();
        if (len > 1e-9 && r.dot(dir) / len > Math.cos(0.22)) d.push(len);
      }
      return percentile(d, 0.03);
    };
    inner = { up: reach(up), down: reach(up.clone().negate()), left: reach(side.clone().negate()), right: reach(side) };
    centre.addScaledVector(up, (inner.up - inner.down) / 2).addScaledVector(side, (inner.right - inner.left) / 2);
  }
  const width = size.getComponent(k);
  return { axis, up, side, centre, innerUp: (inner.up + inner.down) / 2, innerSide: (inner.left + inner.right) / 2, width };
}
