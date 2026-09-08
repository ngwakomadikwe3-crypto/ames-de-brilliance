import { readFile,readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const hash=b=>createHash('sha256').update(b).digest('hex');
const vercel=JSON.parse(await readFile('vercel.json','utf8'));assert.equal(vercel.framework,'nextjs');
const integrity=JSON.parse(await readFile('public/models/canonical/integrity.json','utf8'));
for(const a of integrity)assert.equal(hash(await readFile('public'+a.path)),a.sha256);
async function files(dir){const out=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=join(dir,e.name);out.push(...e.isDirectory()?await files(p):[p])}return out}
const chunks=(await files('.next/static')).filter(p=>p.endsWith('.js'));
for(const p of chunks)assert.ok(!/APPWRITE_API_KEY|APPWRITE_PROVISION_KEY|APPWRITE_ASSET_IMPORT_KEY|ASSET_DELIVERY_SECRET|SESSION_SECRET|adb-session-secret-2026/.test(await readFile(p,'utf8')),'server-secret code in client chunk');
const publicGlbs=(await files('public')).filter(p=>p.endsWith('.glb'));
const packageJson=JSON.parse(await readFile('package.json','utf8'));assert.equal(packageJson.dependencies['@ames/engine'],'file:vendor/ames-engine-0.1.0.tgz');
const buildId=(await readFile('.next/BUILD_ID','utf8')).trim();assert.ok(buildId);
console.log(JSON.stringify({buildId,publicGlbs:publicGlbs.length,canonicalHashes:integrity.length,clientChunksChecked:chunks.length,serverSecretIdentifiersAbsent:true,engineArchiveSha256:hash(await readFile('vendor/ames-engine-0.1.0.tgz')),configuration:'Vercel + Appwrite',readiness:'NOT_READY_FOR_DEPLOYMENT',note:'No live credentials or Appwrite connectivity tested; static scan is not a security certification'}));
