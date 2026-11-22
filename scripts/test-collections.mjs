// node --experimental-strip-types scripts/test-collections.mjs
import assert from 'node:assert/strict';
import { applyShared, bundlePrice, isActive, packageRequest, resolveSet, setOverride, sharedOptions } from '../src/lib/collection-logic.ts';
const METAL = { key: 'metal', label: 'Metal', choices: ['925 silver, rhodium plated', '18k white gold', '18k yellow gold', '18k rose gold', 'Platinum'] };
const STONES = { key: 'stones', label: 'Stones', choices: ['Moissanite', 'Lab-grown diamond', 'Natural diamond'] };
const ACCENT = { key: 'accent', label: 'Accent stones', choices: ['None', 'Sapphire', 'Ruby', 'Emerald'] };
const D = (code, category, extra) => ({ code, name: code, category, options: [METAL, extra, STONES, ACCENT] });
const set = [D('W1', 'watch', { key: 'case', label: 'Case', choices: ['40 mm', '42 mm'] }), D('B2', 'bracelet', { key: 'size', label: 'Inner size', choices: ['S', 'M'] }),
  D('N1', 'necklace', { key: 'length', label: 'Length', choices: ['40 cm', '45 cm'] }), D('E1', 'earrings', { key: 'back', label: 'Back', choices: ['Push', 'Screw'] })];

// shared controls: metal, stones, accent (sizes stay per piece)
assert.deepEqual(sharedOptions(set).map(o => o.key), ['metal', 'stones', 'accent']);
// pick yellow gold: all four pieces change
let st = applyShared({}, {}, 'metal', '18k yellow gold');
assert.ok(resolveSet(set, st.shared, st.overrides).every(p => p.choice.metal === '18k yellow gold'));
st = applyShared(st.shared, st.overrides, 'accent', 'Sapphire');
assert.ok(resolveSet(set, st.shared, st.overrides).every(p => p.choice.accent === 'Sapphire'));
console.log('ok one metal / accent choice updates all four pieces');
// override one piece, then the shared choice changes again: the override is cleared for that key only
st.overrides = setOverride(st.overrides, 'W1', 'metal', '18k rose gold');
st.overrides = setOverride(st.overrides, 'W1', 'case', '42 mm');
let r = resolveSet(set, st.shared, st.overrides);
assert.equal(r[0].choice.metal, '18k rose gold'); assert.equal(r[1].choice.metal, '18k yellow gold'); assert.deepEqual(r[0].overridden, ['metal', 'case']);
st = applyShared(st.shared, st.overrides, 'metal', 'Platinum');
r = resolveSet(set, st.shared, st.overrides);
assert.ok(r.every(p => p.choice.metal === 'Platinum')); assert.equal(r[0].choice.case, '42 mm');
console.log('ok a piece can be overridden; a new shared choice applies to all again, sizes kept');
// a shared choice a piece cannot take: it keeps its own and says so
const limited = [...set.slice(0, 3), { ...set[3], options: [{ ...METAL, choices: ['18k white gold'] }, STONES, ACCENT] }];
r = resolveSet(limited, { metal: '18k yellow gold' }, {});
assert.deepEqual(r[3].unavailable, ['metal']); assert.equal(r[3].choice.metal, '18k white gold');
console.log('ok a piece that cannot take a shared choice keeps its own and flags it');

// pricing
const P = (a) => ({ currency: 'BWP', amount: a });
let b = bundlePrice([P(40000), P(25000), P(30000), P(15000)], 10);
assert.equal(b.subtotal, 110000); assert.equal(b.total, 99000); assert.ok(b.total < b.subtotal);
const minusWatch = bundlePrice([P(25000), P(30000), P(15000)], 10);
assert.equal(minusWatch.total, 63000);
const single = bundlePrice([P(30000)], 10);
assert.equal(single.discountPercent, 0); assert.equal(single.total, 30000);
for (const pct of [0, -5, 0.001, 99]) { const x = bundlePrice([P(100), P(200)], pct); assert.ok(x.total < x.subtotal && x.discountPercent >= 1 && x.discountPercent <= 50, `discount ${pct} is clamped so the set is always cheaper`); }
assert.equal(bundlePrice([P(100), null], 10).complete, false);
assert.equal(bundlePrice([P(100), { currency: 'USD', amount: 9 }], 10).complete, false);
console.log('ok bundle = pieces minus 10% (110 000 -> 99 000); minus the watch 63 000; one piece has no discount; set always cheaper');

// future-proofing: 2-piece, themed, seasonal entries are just data
const evening = { id: 'evening', name: 'Evening Set', description: '', pieces: ['N1', 'E1'], defaults: { accent: 'Sapphire' }, season: { from: '2026-12-01', until: '2027-01-15' } };
assert.equal(isActive(evening, new Date('2026-11-22')), false); assert.equal(isActive(evening, new Date('2026-12-24')), true);
assert.equal(isActive({ ...evening, pieces: ['N1'] }, new Date('2026-12-24')), false);
console.log('ok two-piece, themed and seasonal collections are data entries');

// one package request listing every remaining piece
const text = packageRequest({ id: 'the-house-suite', name: 'The House Suite', description: '', pieces: ['W1', 'B2', 'N1', 'E1'] },
  [{ code: 'B2', name: 'B2', configuration: 'B2 · Metal: Platinum' }, { code: 'N1', name: 'N1', configuration: 'N1 · Metal: Platinum' }, { code: 'E1', name: 'E1', configuration: 'E1 · Metal: Platinum' }], minusWatch);
assert.match(text, /without W1/); assert.match(text, /3\. E1/); assert.match(text, /BWP 63000\.00/);
console.log('ok the package (minus the watch) is one request with every piece and the price');
