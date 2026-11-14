// Replace placeholder stone geometry inside a jewellery GLB with real cuts.
//
// Only the stone meshes change. Nodes, names, hierarchy, materials, metal,
// animations and extras are left exactly as they were, so the live 3D engine
// (unclasp, measure, its own optics) keeps working on the new file.
//
// usage: node restone-glb.mjs in.glb out.glb '<prefix>=<cut>' ...
//   e.g. 'Tennis diamond=round' 'Pear drop diamond=pear'
//        '@gem=stone-ruby'  (a loose gemstone file: every mesh gets that gem's cut)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import fs from 'node:fs';

const [src, dst, ...specs] = process.argv.slice(2);
const T = JSON.parse(fs.readFileSync(new URL('./cut-templates.json', import.meta.url)));
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(src);
const root = doc.getRoot();
for (const ext of root.listExtensionsUsed()) if (ext.extensionName === 'EXT_meshopt_compression') ext.dispose();

const rules = specs.map(s => s.split('='));
const gemRule = rules.find(([p]) => p === '@gem');

// Template bounds, computed once per cut.
function bounds(arr) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < arr.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], arr[i + k]); hi[k] = Math.max(hi[k], arr[i + k]); }
  return { lo, hi, size: hi.map((h, k) => h - lo[k]), mid: hi.map((h, k) => (h + lo[k]) / 2) };
}

// How the old stone lies in its own frame: longest axis is the length,
// shortest the depth; the narrower end of the length is the tip (pears) and
// the broader extreme of the depth is the table.
function orient(pos) {
  const b = bounds(pos);
  const ax = [0, 1, 2].sort((p, q) => b.size[q] - b.size[p]);
  const [a, w, d] = ax;
  const spread = (axis, f0, f1, others) => {
    let m = 0;
    for (let i = 0; i < pos.length; i += 3) {
      const t = (pos[i + axis] - b.lo[axis]) / (b.size[axis] || 1);
      if (t < f0 || t > f1) continue;
      for (const o of others) m = Math.max(m, Math.abs(pos[i + o] - b.mid[o]));
    }
    return m;
  };
  const tip = spread(a, 0.82, 1, [w]) < spread(a, 0, 0.18, [w]) ? 1 : -1;
  const table = spread(d, 0.9, 1, [a, w]) > spread(d, 0, 0.1, [a, w]) ? 1 : -1;
  return { b, a, w, d, tip, table };
}

function fit(tpl, pos) {
  const o = orient(pos), tb = bounds(tpl.position);
  const sx = o.b.size[o.a] / tb.size[0], sy = o.b.size[o.w] / tb.size[1];
  // Depth follows the width (true proportions), not the stand-in: the table
  // stays where the old table was and the pavilion sinks into the setting.
  const sz = sy;
  const P = new Float32Array(tpl.position.length), N = new Float32Array(tpl.normal.length);
  const tableAt = o.table > 0 ? o.b.hi[o.d] : o.b.lo[o.d];
  for (let i = 0; i < tpl.position.length; i += 3) {
    const x = (tpl.position[i] - tb.mid[0]) * sx * o.tip;
    const y = (tpl.position[i + 1] - tb.mid[1]) * sy;
    const zFromTable = (tpl.position[i + 2] - tb.hi[2]) * sz;          // <= 0
    P[i + o.a] = o.b.mid[o.a] + x;
    P[i + o.w] = o.b.mid[o.w] + y;
    P[i + o.d] = tableAt + o.table * zFromTable;
    const n = [tpl.normal[i] * o.tip / sx, tpl.normal[i + 1] / sy, tpl.normal[i + 2] * o.table / sz];
    const L = Math.hypot(...n) || 1;
    N[i + o.a] = n[0] / L; N[i + o.w] = n[1] / L; N[i + o.d] = n[2] / L;
  }
  // Make every triangle's winding agree with its intended outward normal.
  // Fitting can mirror the cut (a tip or table flipped along an axis), and a
  // triangle wound backwards turns the glass inside-out: the stone renders as
  // a milky blob instead of a cut gem.
  let flipped = 0;
  for (let i = 0; i < P.length; i += 9) {
    const ux = P[i + 3] - P[i], uy = P[i + 4] - P[i + 1], uz = P[i + 5] - P[i + 2];
    const vx = P[i + 6] - P[i], vy = P[i + 7] - P[i + 1], vz = P[i + 8] - P[i + 2];
    const gx = uy * vz - uz * vy, gy = uz * vx - ux * vz, gz = ux * vy - uy * vx;
    if (gx * N[i] + gy * N[i + 1] + gz * N[i + 2] < 0) {
      flipped++;
      for (let k = 0; k < 3; k++) {
        [P[i + 3 + k], P[i + 6 + k]] = [P[i + 6 + k], P[i + 3 + k]];
        [N[i + 3 + k], N[i + 6 + k]] = [N[i + 6 + k], N[i + 3 + k]];
      }
    }
  }
  fit.flipped = (fit.flipped || 0) + flipped;
  return { P, N };
}

const meshCut = new Map();
for (const node of root.listNodes()) {
  const mesh = node.getMesh(); if (!mesh) continue;
  if (gemRule) { meshCut.set(mesh, T.gems[gemRule[1]]); continue; }
  const rule = rules.filter(([p]) => node.getName().startsWith(p) && !/setting|claw|gallery|bead/i.test(node.getName()))
                    .sort((x, y) => y[0].length - x[0].length)[0];
  if (rule) meshCut.set(mesh, T.pieces[rule[1]]);
}

let n = 0;
for (const [mesh, tpl] of meshCut) {
  for (const prim of mesh.listPrimitives()) {
    // Read real coordinates. Compressed files store positions as normalized
    // integers; taking the raw integers as sizes blows each stone up by ~30000x.
    const acc = prim.getAttribute('POSITION'), old = new Float32Array(acc.getCount() * 3), el = [];
    for (let i = 0; i < acc.getCount(); i++) { acc.getElement(i, el); old[i * 3] = el[0]; old[i * 3 + 1] = el[1]; old[i * 3 + 2] = el[2]; }
    const { P, N } = fit(tpl, old);
    for (const sem of prim.listSemantics()) if (sem !== 'POSITION' && sem !== 'NORMAL') prim.setAttribute(sem, null);
    const buf = root.listBuffers()[0];
    prim.setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(P).setBuffer(buf));
    prim.setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(N).setBuffer(buf));
    prim.setIndices(null);
    n++;
  }
}
// Drop accessors nothing uses any more, so the file does not carry both stones.
for (const acc of root.listAccessors()) if (acc.listParents().filter(p => p !== root).length === 0) acc.dispose();
await io.write(dst, doc);
console.log(`${src.split('/').pop()} -> ${dst.split('/').pop()}: ${meshCut.size} stone meshes, ${n} primitives recut, ${fit.flipped || 0} triangles re-wound`);
