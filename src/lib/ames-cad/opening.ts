// Pieces that open (watch cases, jewellery boxes, lockets, compacts): a lid, cover or flap named in the CAD
// becomes a hinged part the viewer can swing open (ames_open). The hinge is a part named "hinge" when there is
// one; otherwise the lid's edge nearest the body, on the side away from any snap, catch or clasp.
import { len, sub, type Analysis, type Shell, type SourcePart, type Vec3 } from './geometry';
import { shellStats } from './links';
import type { Rig } from './rig';

// CAD exporters often write spaces as underscores (Case_lid), so words are bounded by any non-letter.
const LID_WORDS = /(?<![a-z])(lids?|covers?|flaps?|doors?|top[\s_-]*(shell|half|lid|cover)|upper[\s_-]*(shell|half))(?![a-z])/i;
const HINGE_WORDS = /(?<![a-z])hinges?(?![a-z])/i, CATCH_WORDS = /clasp|snap|latch|catch|(?<![a-z])tab(?![a-z])|lock|button|magnet|press[\s_-]*stud/i;
const OPEN_ANGLE = 110;

type Box = { lo: Vec3; hi: Vec3 };
const boxOf = (shells: Shell[]): Box => { const lo: Vec3 = [Infinity, Infinity, Infinity], hi: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const s of shells) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], s.min[k]); hi[k] = Math.max(hi[k], s.max[k]); } return { lo, hi }; };
const mid = (b: Box) => b.lo.map((v, k) => (v + b.hi[k]) / 2) as Vec3;
/** Rotate p about the line through o along unit axis k (one of x, y, z) by angle a. */
function turn(p: Vec3, o: Vec3, k: number, a: number): Vec3 {
  const d = sub(p, o), i = (k + 1) % 3, j = (k + 2) % 3, c = Math.cos(a), s = Math.sin(a), out = [...d] as Vec3;
  out[i] = d[i] * c - d[j] * s; out[j] = d[i] * s + d[j] * c; return out.map((v, q) => v + o[q]) as Vec3;
}

export function planOpening(parts: SourcePart[], a: Analysis & { shells: Shell[] }): Rig | null {
  const shells = a.shells, name = (i: number) => parts[shells[i].part].own ?? parts[shells[i].part].hint;
  const lid = shells.map((_, i) => i).filter(i => LID_WORDS.test(name(i)));
  if (!lid.length || lid.length === shells.length) return null;
  const inLid = new Set(lid), rest = shells.map((_, i) => i).filter(i => !inLid.has(i));
  const lidBox = boxOf(lid.map(i => shells[i]));
  const stats = shells.map(s => shellStats(parts, s)), centre = (list: number[]) => { const c: Vec3 = [0, 0, 0]; let w = 0;
    for (const i of list) { for (let k = 0; k < 3; k++) c[k] += stats[i].c[k] * stats[i].area; w += stats[i].area; } return c.map(v => v / (w || 1)) as Vec3; };
  const lidC = centre(lid), bodyC = centre(rest), away = sub(lidC, bodyC);
  if (len(away) < 1e-6) return null;
  // Hinge axis and point.
  const hinges = rest.filter(i => HINGE_WORDS.test(name(i))).concat(lid.filter(i => HINGE_WORDS.test(name(i))));
  let axis: number, o: Vec3;
  if (hinges.length) {
    const hb = boxOf(hinges.map(i => shells[i])), size = [0, 1, 2].map(k => hb.hi[k] - hb.lo[k]);
    axis = size.indexOf(Math.max(...size)); o = mid(hb);
  } else {
    // Along the lid's longest side; on the edge facing the body, and on the far side from a catch (else the back, -z).
    const size = [0, 1, 2].map(k => lidBox.hi[k] - lidBox.lo[k]); axis = size.indexOf(Math.max(...size));
    const others = [0, 1, 2].filter(k => k !== axis), toward = others.reduce((x, y) => Math.abs(away[x]) >= Math.abs(away[y]) ? x : y), side = others.find(k => k !== toward)!;
    const catches = shells.map((_, i) => i).filter(i => CATCH_WORDS.test(name(i))), catchC = catches.length ? centre(catches) : null;
    o = mid(lidBox);
    o[toward] = away[toward] > 0 ? lidBox.lo[toward] : lidBox.hi[toward];
    o[side] = catchC && catchC[side] < o[side] ? lidBox.hi[side] : lidBox.lo[side];
  }
  // Open the way that lifts the lid away from the body.
  const lift = (s: number) => { const p = turn(lidC, o, axis, s * 60 * Math.PI / 180); return (p[0] - bodyC[0]) * away[0] + (p[1] - bodyC[1]) * away[1] + (p[2] - bodyC[2]) * away[2]; };
  const sign = lift(1) >= lift(-1) ? 1 : -1, unit: Vec3 = [0, 0, 0]; unit[axis] = 1;
  const shellNode = new Int32Array(shells.length).fill(-1); for (const i of lid) shellNode[i] = 0;
  // Stones set in the lid go with it.
  const nodeOf = (p: Vec3) => [0, 1, 2].every(k => p[k] >= lidBox.lo[k] - .3 && p[k] <= lidBox.hi[k] + .3) ? 0 : -1;
  return { nodes: [{ name: 'Lid (hinged)', parent: -1, o, x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1], extras: { ames_open: { axis: unit, angle: sign * OPEN_ANGLE, label: 'lid' } } }],
    shellNode, triangleNode: new Map(), nodeOf, extras: {} };
}
