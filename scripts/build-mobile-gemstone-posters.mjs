import {readFile, stat, rename} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
const only=new Set(process.argv.slice(2));
const registry=JSON.parse(await readFile('src/lib/gemstone-registry.json','utf8'));
for(const stone of registry.filter(s=>s.form.startsWith('faceted')&&(!only.size||only.has(s.id)))){
 const png=path.join('.ames-cad/mobile-optics/posters',`${stone.id}.png`);
 const blend=path.join('source-assets/gemstones',`${stone.id}.blend`);
 const source=await stat(png),scene=await stat(blend);
 if(source.mtimeMs<scene.mtimeMs)throw new Error(`Poster is older than its model: ${stone.id}`);
 const target=`public/ames-engine/${stone.id}/web/poster.webp`;
 const image=sharp(await readFile(png));const metadata=await image.metadata();
 if(metadata.width!==640||metadata.height!==640||!metadata.hasAlpha)throw new Error(`Invalid poster ${stone.id}`);
 await image.webp({quality:94,effort:6}).toFile(target+'.tmp');await rename(target+'.tmp',target);
 console.log(`POSTER ${stone.id}`);
}
