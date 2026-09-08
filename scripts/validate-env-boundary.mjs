import {readFile,readdir,writeFile,access} from 'node:fs/promises';
import {join,dirname,resolve,relative} from 'node:path';
import assert from 'node:assert/strict';
import {customerConfig,assertConfigured} from '../src/lib/customer/config.mjs';
async function files(dir){const out=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=join(dir,e.name);out.push(...e.isDirectory()?await files(p):[p]);}return out;}
const sources=(await files('src')).filter(p=>/\.(?:[cm]?js|tsx?)$/.test(p)),clientRoots=[];for(const p of sources)if(/^\s*['"]use client['"]/.test(await readFile(p,'utf8')))clientRoots.push(resolve(p));
const visited=new Set();async function walk(path){if(visited.has(path))return;visited.add(path);const text=await readFile(path,'utf8');assert.ok(!/APPWRITE_API_KEY|ASSET_DELIVERY_SECRET|SESSION_SECRET|AMES_APP_ORIGIN|node-appwrite|node:crypto/.test(text),'Server boundary reachable from client: '+relative('.',path));
 for(const match of text.matchAll(/(?:from\s*|import\s*\()\s*['"]([^'"]+)['"]/g)){const ref=match[1],base=ref.startsWith('@/')?resolve('src',ref.slice(2)):ref.startsWith('.')?resolve(dirname(path),ref):null;if(!base)continue;for(const p of [base,...['.ts','.tsx','.mjs','.js','/index.ts','/index.tsx'].map(e=>base+e)]){try{await access(p);if(/\.(tsx?|m?js)$/.test(p))await walk(p);break;}catch(e){if(e.code!=='ENOENT'&&e.code!=='ENOTDIR')throw e;}}}}
for(const root of clientRoots)await walk(root);
const example=await readFile('.env.example','utf8');for(const key of ['AMES_APP_ORIGIN','ASSET_DELIVERY_SECRET','SESSION_SECRET'])assert.match(example,new RegExp('^'+key+'=$','m'));
const current=customerConfig();const report={clientRoots:clientRoots.length,reachableClientModules:visited.size,serverModulesUnreachable:true,blankPlaceholders:true,endpointConfigured:!!current.endpoint,projectConfigured:!!current.project,missing:['AMES_APP_ORIGIN','ASSET_DELIVERY_SECRET','SESSION_SECRET'].filter(k=>!process.env[k])};
try{assertConfigured(current);report.runtimeConfigurationReady=true;}catch{report.runtimeConfigurationReady=false;}await writeFile('outputs/env-boundary.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
