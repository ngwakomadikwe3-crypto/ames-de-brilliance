// Official imagery for the eight custom-order designs (W1 W2 B1 B2 N1 N2 E1 E2).
//
// Masters are the PNG renders, saved unchanged in public/atelier/designs/<CODE>/<file>.png using the names
// below. This script writes AVIF and WebP copies beside them (same pixels: no crop, no recolour, no filter;
// only smaller widths for small screens, never upscaled) and records what exists in
// src/lib/custom-design-images.json, which the app reads. A missing master is simply reported, never faked.
//
// Run after adding or replacing a render:   node scripts/build-design-images.mjs
// (needs the sharp package: npm i --no-save sharp)
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const DESIGN_FILES = {
  W1: 'W1-classic-pave-watch', W2: 'W2-square-boutique-watch', B1: 'B1-tennis-line-bracelet', B2: 'B2-pave-bangle',
  N1: 'N1-riviere-drop-necklace', N2: 'N2-solitaire-pendant', E1: 'E1-cascade-drop-earrings', E2: 'E2-convertible-stud',
};
// views every design needs, plus the stud-alone fronts of the two convertible earrings
const VIEWS = code => ['front', 'back', ...(code.startsWith('E') ? ['stud-front'] : [])];
const WIDTHS = [480, 960, 1600];

const root = 'public/atelier/designs';
let sharp = null;
try { sharp = (await import('sharp')).default; } catch { /* reported below */ }
const manifest = {}, missing = [];
for (const [code, base] of Object.entries(DESIGN_FILES)) {
  const dir = join(root, code); mkdirSync(dir, { recursive: true });
  manifest[code] = {};
  for (const view of VIEWS(code)) {
    const name = `${base}-${view}`, png = join(dir, name + '.png');
    if (!existsSync(png)) { manifest[code][view] = null; missing.push(`${code}/${name}.png`); continue; }
    if (!sharp) throw new Error('Install sharp first: npm i --no-save sharp');
    const meta = await sharp(png).metadata();
    const widths = [...new Set([...WIDTHS.filter(w => w < meta.width), meta.width])];
    for (const w of widths) {
      const resized = () => sharp(png).resize({ width: w, withoutEnlargement: true });
      await resized().avif({ quality: 62, effort: 6 }).toFile(join(dir, `${name}-${w}.avif`));
      await resized().webp({ quality: 86 }).toFile(join(dir, `${name}-${w}.webp`));
    }
    // remove variants of widths this master no longer has
    for (const f of readdirSync(dir)) {
      const m = f.match(new RegExp(`^${name}-(\\d+)\\.(avif|webp)$`));
      if (m && !widths.includes(+m[1])) console.warn('stale variant (delete):', join(dir, f));
    }
    manifest[code][view] = { src: `/atelier/designs/${code}/${name}.png`, base: `/atelier/designs/${code}/${name}`, width: meta.width, height: meta.height, widths };
  }
}
writeFileSync('src/lib/custom-design-images.json', JSON.stringify(manifest, null, 2) + '\n');
console.log(`Design images: ${Object.values(manifest).flatMap(Object.values).filter(Boolean).length} present.`);
if (missing.length) console.log(`Missing (flagged in the app, never faked):\n  ${missing.join('\n  ')}`);
