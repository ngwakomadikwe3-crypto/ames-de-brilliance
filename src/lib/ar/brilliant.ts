import { BufferGeometry, Float32BufferAttribute } from 'three';
// A light round brilliant for instanced melee: table, 16 crown facets in two tiers, girdle, 16 pavilion facets
// to a culet. Diameter 2 (radius 1), table toward +Y, girdle at y = 0. Flat-shaded so each facet flashes.
export function brilliantGeometry(sides = 16) {
  const table = 0.56, crown = 0.32, girdle = 0.03, pavilion = 0.86;   // in girdle radii: 16% crown, 43% pavilion of the diameter
  const ring = (r: number, y: number, turn = 0) => Array.from({ length: sides }, (_, i) => {
    const a = (i + turn) * 2 * Math.PI / sides; return [r * Math.cos(a), y, r * Math.sin(a)];
  });
  const top = ring(table, girdle + crown), star = ring(0.8, girdle + crown * 0.45, 0.5), gt = ring(1, girdle), gb = ring(1, -girdle);
  const culet = [0, -girdle - pavilion, 0], centre = [0, girdle + crown, 0];
  const tris: number[][] = [];
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    tris.push(centre, top[j], top[i]);                         // table
    tris.push(top[i], top[j], star[i]);                        // stars
    tris.push(top[i], star[i], gt[i]); tris.push(star[i], gt[j], gt[i]); tris.push(top[j], gt[j], star[i]);  // bezels / upper halves
    tris.push(gt[i], gt[j], gb[j]); tris.push(gt[i], gb[j], gb[i]);                                          // girdle
    tris.push(gb[i], gb[j], culet);                                                                            // pavilion
  }
  // Wind every facet outward (normal away from the stone's middle).
  for (let t = 0; t < tris.length; t += 3) {
    const [a, b, c] = [tris[t], tris[t + 1], tris[t + 2]];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const m = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3 - 0.1, (a[2] + b[2] + c[2]) / 3];
    if (n[0] * m[0] + n[1] * m[1] + n[2] * m[2] < 0) { tris[t + 1] = c; tris[t + 2] = b; }
  }
  const positions = new Float32Array(tris.length * 3);
  tris.forEach((p, i) => positions.set(p, i * 3));
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  return g;
}
