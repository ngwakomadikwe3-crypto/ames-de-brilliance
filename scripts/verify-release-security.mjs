import {readFile,readdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
async function files(dir){const result=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=join(dir,e.name);result.push(...e.isDirectory()?await files(p):[p]);}return result;}
const secretNames=['APPWRITE_API_KEY','APPWRITE_PROVISION_KEY','APPWRITE_ASSET_IMPORT_KEY','ASSET_DELIVERY_SECRET','SESSION_SECRET'],secretValues=secretNames.map(k=>process.env[k]).filter(v=>v&&v.length>=16),assets=[...await files('.next/static'),...await files('public')];
for(const path of assets){const bytes=await readFile(path);for(const value of secretValues)assert.ok(!bytes.includes(Buffer.from(value)),'Secret found in a browser-served artifact');}
const report={at:new Date().toISOString(),browserArtifacts:assets.length,configuredSecretValuesChecked:secretValues.length,secretsAbsent:true,missingProductionVariables:['AMES_APP_ORIGIN','ASSET_DELIVERY_SECRET','SESSION_SECRET'].filter(k=>!process.env[k]),engineArchiveSha256:createHash('sha256').update(await readFile('vendor/ames-engine-0.1.0.tgz')).digest('hex')};
await writeFile('outputs/final-release-security.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
