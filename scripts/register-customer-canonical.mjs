import {canonicalAssetManifest} from '@ames/engine';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const dir=await mkdtemp(join(tmpdir(),'ames-public-catalog-'));
for(const a of canonicalAssetManifest.assets){const metadata=join(dir,a.id+'.json');await writeFile(metadata,JSON.stringify({...a,accessTier:'PUBLIC',status:'published',revision:1}));
 const result=spawnSync(process.execPath,['scripts/register-customer-asset.mjs',metadata,'public'+a.assetPath,...(process.argv.includes('--apply')?['--apply']:[])],{stdio:'inherit',windowsHide:true});if(result.status!==0)throw new Error('Canonical registration stopped; inspect the preceding validation error.');}
