import { readFile, writeFile } from 'node:fs/promises';
import { loadBoutiqueContent } from '../src/lib/ames-boutique-content.ts';

// Bundle the house collection so the first piece can render before the listings API answers.
const pieces = await loadBoutiqueContent(async path => new Response(await readFile(new URL('../public' + path, import.meta.url), 'utf8')));
await writeFile(new URL('../src/lib/boutique-house-pieces.json', import.meta.url), JSON.stringify(pieces, null, 2) + '\n');
