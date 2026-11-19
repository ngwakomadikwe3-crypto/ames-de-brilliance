// The merged bezel spans the whole watch face. Its absorption length must be
// based on a single diamond's diameter, measured in the pavé parent's units.
import {readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const file=resolve(dirname(require.resolve('ames-engine')),'../jewelry/PhysicalStudioModel.tsx');
const source=await readFile(file,'utf8');
const anchor='mesh.material=material;materials.push(material);mesh.layers.enable(STAR_LAYER)';
const fix=`if(typeof layout==='string' && id.includes('diamond') && id!=='stone-diamond'){
        const record=atob(layout).slice(0,32)
        if(record.length===32 && mesh.parent){
          const diameter=new DataView(Uint8Array.from(record,c=>c.charCodeAt(0)).buffer).getFloat32(28,true)
          const parentScale=mesh.parent.getWorldScale(new Vector3()).length()/Math.sqrt(3)
          if(diameter>0) material.attenuationDistance=diameter*parentScale*scale*.40
        }
      }`;
if(!source.includes(fix)){
  if(!source.includes(anchor))throw Error('Mounted gemstone renderer has changed.');
  await writeFile(file,source.replace(anchor,fix+'\n      '+anchor));
}
