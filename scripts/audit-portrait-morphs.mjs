// Audit the parametric head's morph targets one by one (no browser): is the base head symmetric, and does each target
// alone make a smooth, symmetric (where it should be) deformation of a sensible size, in the region it is named for?
//   node --experimental-strip-types --import ./scripts/ts-resolve.mjs scripts/audit-portrait-morphs.mjs [--json out]
import { readFileSync, writeFileSync } from 'node:fs';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
await MeshoptDecoder.ready;
const buf = readFileSync(new URL('../public/portrait-twin/portrait-head-v2.glb', import.meta.url));
const l = new GLTFLoader(); l.setMeshoptDecoder(MeshoptDecoder);
const g = await new Promise((r, j) => l.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '', r, j));
g.scene.scale.setScalar(1000); g.scene.updateMatrixWorld(true);
const skin = g.scene.getObjectByName('Head_skin');
const M = skin.matrixWorld.elements, s = Math.hypot(M[0], M[1], M[2]);            // local -> mm (uniform)
const pos = skin.geometry.getAttribute('position'), n = pos.count, idx = skin.geometry.index.array;
const P = new Float64Array(n * 3); for (let i = 0; i < n; i++) { P[i * 3] = pos.getX(i) * s; P[i * 3 + 1] = pos.getY(i) * s; P[i * 3 + 2] = pos.getZ(i) * s; }
// neighbours (welded by position, UV seams split vertices)
const nb = Array.from({ length: n }, () => new Set());
for (let t = 0; t < idx.length; t += 3) for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) if (a !== b) nb[idx[t + a]].add(idx[t + b]);
// mirror partner of each vertex: nearest to (-x, y, z) (spatial hash, 1 mm cells)
const cell = new Map(); const ck = (x, y, z) => `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
for (let i = 0; i < n; i++) { const k = ck(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); (cell.get(k) ?? cell.set(k, []).get(k)).push(i); }
const mirror = new Int32Array(n); let baseAsym = 0, baseMax = 0;
for (let i = 0; i < n; i++) {
  const x = -P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2]; let best = 1e9, bj = -1;
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++)
    for (const j of cell.get(ck(x + dx, y + dy, z + dz)) ?? []) { const d = Math.hypot(P[j * 3] - x, P[j * 3 + 1] - y, P[j * 3 + 2] - z); if (d < best) { best = d; bj = j; } }
  mirror[i] = bj; baseAsym += best; baseMax = Math.max(baseMax, best);
}
console.log(`base head: ${n} vertices; mirror mismatch mean ${(baseAsym / n).toFixed(3)} mm, max ${baseMax.toFixed(2)} mm (0 = perfectly symmetric)`);
const dict = skin.morphTargetDictionary, morphs = skin.geometry.morphAttributes.position;
const rows = [];
for (const [name, at] of Object.entries(dict)) {
  const a = morphs[at], D = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) { D[i * 3] = a.getX(i) * s; D[i * 3 + 1] = a.getY(i) * s; D[i * 3 + 2] = a.getZ(i) * s; }
  let max = 0, sum = 0, cnt = 0, asym = 0, rough = [], cx = 0, cy = 0, cz = 0, lids = 0;
  for (let i = 0; i < n; i++) {
    const m = Math.hypot(D[i * 3], D[i * 3 + 1], D[i * 3 + 2]); max = Math.max(max, m); if (P[i * 3 + 1] > 466) lids = Math.max(lids, m);   // eyelids and above
    if (m < 0.05) continue;
    sum += m; cnt++; cx += P[i * 3] * m; cy += P[i * 3 + 1] * m; cz += P[i * 3 + 2] * m;
    const j = mirror[i]; asym += Math.hypot(D[i * 3] + D[j * 3], D[i * 3 + 1] - D[j * 3 + 1], D[i * 3 + 2] - D[j * 3 + 2]);
    // lumpiness: how far this vertex's delta departs from its neighbours' mean, relative to the target's scale
    let ax = 0, ay = 0, az = 0, k = 0; for (const j2 of nb[i]) { ax += D[j2 * 3]; ay += D[j2 * 3 + 1]; az += D[j2 * 3 + 2]; k++; }
    if (k) rough.push(Math.hypot(D[i * 3] - ax / k, D[i * 3 + 1] - ay / k, D[i * 3 + 2] - az / k));
  }
  rough.sort((x, y) => x - y);
  const r95 = rough.length ? rough[Math.floor(rough.length * 0.95)] : 0;
  rows.push({ name, max: +max.toFixed(2), lids: +lids.toFixed(2), support: cnt, asym: cnt ? +(asym / sum).toFixed(3) : 0, lumps: max ? +(r95 / max).toFixed(3) : 0, centre: cnt ? [cx / sum, cy / sum, cz / sum].map(v => Math.round(v)) : null });
}
rows.sort((a, b) => b.lumps - a.lumps);
console.log('name'.padEnd(34), 'max mm'.padStart(7), 'verts'.padStart(6), 'asym'.padStart(6), 'lumps'.padStart(6), ' centre (mm)');
for (const r of rows) console.log(r.name.padEnd(34), String(r.max).padStart(7), String(r.support).padStart(6), String(r.asym).padStart(6), String(r.lumps).padStart(6), ' ', JSON.stringify(r.centre));
const out = process.argv.indexOf('--json'); if (out > 0) writeFileSync(process.argv[out + 1], JSON.stringify({ baseAsym: baseAsym / n, rows }, null, 1));
