// Acceptance for the head's morph targets (run before any scan solve may use them):
//  - all weights 0: the MakeHuman base head, symmetric;
//  - every target alone is smooth (no lumps) and mirror-symmetric (except the one-eyed blinks);
//  - the smile and the cheek raise never touch the eyelids;
//  - the weight rules: one value per opposing pair, sane ranges, the ancestry/sex mix summing to 1.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { sanitizeWeights, identityAxes, saneLimits, SANE_MM } from '../src/lib/portrait-weights.ts';

execFileSync(process.execPath, ['--experimental-strip-types', '--import', './scripts/ts-resolve.mjs', 'scripts/audit-portrait-morphs.mjs', '--json', '/tmp/portrait-morph-audit.json'], { stdio: 'ignore' });
const audit = JSON.parse(readFileSync('/tmp/portrait-morph-audit.json', 'utf8'));
assert.ok(audit.baseAsym < 0.1, `base head symmetric (mean mirror mismatch ${audit.baseAsym.toFixed(3)} mm)`);
for (const r of audit.rows) {
  assert.ok(r.lumps < 0.15, `${r.name}: smooth (lumps ${r.lumps})`);
  if (!/blink-[lr]$/.test(r.name)) assert.ok(r.asym < 0.05, `${r.name}: symmetric (asym ${r.asym})`);
}
console.log(`ok - ${audit.rows.length} targets: base symmetric, each target smooth and symmetric`);
const byName = Object.fromEntries(audit.rows.map(r => [r.name, r]));
for (const n of ['ex:smile', 'ex:cheeks-up']) assert.ok(byName[n] && byName[n].lids < 0.1, `${n} never moves the eyelids (${byName[n]?.lids} mm)`);
console.log('ok - the smile and cheek raise never touch the eyelids');

const names = audit.rows.map(r => r.name).filter(n => n.startsWith('id:') && !/head-scale/.test(n));
const axes = identityAxes(names);
assert.equal(new Set(axes.map(a => a.id)).size, axes.length, 'axis ids are unique (eyebrows-trans has two axes)');
const lim = saneLimits(Object.fromEntries(audit.rows.map(r => [r.name, r.max])));
assert.ok(lim['id:forehead-nubian-incr'] < 0.3, 'the 58 mm forehead bulge is limited to a sane range');
const w = sanitizeWeights({ 'id:chin-prognathism-decr': 0.3, 'id:chin-prognathism-incr': 0.5, 'id:base-afr-male': 0.8, 'id:base-cau-female': 0.8, 'id:forehead-nubian-incr': 1 }, names, lim);
assert.ok(!w['id:chin-prognathism-decr'] && Math.abs(w['id:chin-prognathism-incr'] - 0.2) < 1e-9, 'an opposing pair becomes one value');
assert.ok(Math.abs(w['id:base-afr-male'] + w['id:base-cau-female'] - 1) < 1e-9, 'the ancestry/sex mix sums to 1');
assert.ok(w['id:forehead-nubian-incr'] * byName['id:forehead-nubian-incr'].max <= SANE_MM + 1e-6, 'no target moves the skin more than its sane range');
assert.ok(Object.values(w).every(v => v >= 0 && v <= 1), 'every weight in [0, 1] (each axis in [-1, 1])');
console.log('ok - weight rules: one value per pair, sane ranges, mix sums to 1');
