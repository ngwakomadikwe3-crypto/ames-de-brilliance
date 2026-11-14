#!/usr/bin/env node
/**
 * Build a studio spin for a piece: photograph it all the way round in Blender Cycles, then pack the frames for the web.
 *
 *   node scripts/build-spin.mjs <piece.blend> <assetId> [--frames 72] [--res 1440] [--detail 2880] [--spp 128] [--gpu]
 *
 * Writes public/ames-engine/<assetId>/spin/: frame-NNN.webp (the spin), detail-NNN.webp (sharper frames loaded only
 * when a customer zooms in, if --detail is given) and manifest.json, which the Boutique reads to open the piece on
 * its spin. Blender: set BLENDER to blender.exe (Windows: "C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe"),
 * otherwise the bpy Python module is used. --frames-from <dir> packs frames already rendered (named *-NNN.png).
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import sharp from 'sharp';

const args = process.argv.slice(2);
const flag = (name, fallback) => { const i = args.indexOf('--' + name); return i < 0 ? fallback : args[i + 1]; };
const [blend, assetId] = args;
if (!blend || !assetId) { console.error('usage: node scripts/build-spin.mjs <piece.blend> <assetId> [--frames 72] [--res 1440] [--detail 2880] [--spp 128] [--gpu]'); process.exit(1); }
const frames = Number(flag('frames', 72)), res = Number(flag('res', 1440)), detailRes = Number(flag('detail', 0)), spp = flag('spp', '128');
const out = resolve('public/ames-engine', assetId, 'spin'); mkdirSync(out, { recursive: true });
const work = resolve('.ames-cad/spin', assetId); mkdirSync(work, { recursive: true });

function render(size, stem) {
  const blender = process.env.BLENDER;
  const studio = resolve('scripts/blender/ames_photo_studio.py');
  const studioArgs = [resolve(blend), join(work, stem + '.png'), '--res', String(size), '--spp', spp, '--frames', String(frames), ...(args.includes('--gpu') ? ['--gpu'] : [])];
  const cmd = blender ? [blender, ['--background', '--python', studio, '--', ...studioArgs]] : ['python3', [studio, ...studioArgs]];
  console.log(`Rendering ${frames} frames at ${size}px…`);
  const r = spawnSync(cmd[0], cmd[1], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('Blender render failed');
}
async function pack(from, stem, size, quality) {
  const files = readdirSync(from).filter(f => /-\d{3}\.png$/.test(f)).sort();
  if (files.length !== frames) throw new Error(`expected ${frames} frames in ${from}, found ${files.length}`);
  let bytes = 0;
  for (const [i, f] of files.entries()) {
    const target = join(out, `${stem}-${String(i).padStart(3, '0')}.webp`);
    const info = await sharp(join(from, f)).resize(size, size).webp({ quality, alphaQuality: 90, effort: 5, smartSubsample: true }).toFile(target);
    bytes += info.size;
  }
  console.log(`Packed ${files.length} ${stem} frames, ${(bytes / 1e6).toFixed(1)} MB`);
}

const from = flag('frames-from', '');
if (from) await pack(resolve(from), 'frame', res, 88);
else { render(res, 'frame'); await pack(work, 'frame', res, 88); }
if (detailRes && !from) { const dwork = join(work, 'detail'); mkdirSync(dwork, { recursive: true }); render(detailRes, 'detail/detail'); await pack(dwork, 'detail', detailRes, 85); }
const manifest = { frames, pattern: 'frame-%03d.webp', size: res, turnSeconds: 14, ...(detailRes && existsSync(join(out, 'detail-000.webp')) ? { detail: { pattern: 'detail-%03d.webp', size: detailRes } } : {}),
  renderer: 'Blender Cycles · AMES photo studio', samples: Number(spp) };
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('Spin ready:', join(out, 'manifest.json'));
