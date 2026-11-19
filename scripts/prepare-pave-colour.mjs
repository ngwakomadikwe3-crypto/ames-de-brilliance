// The merged bezel spans the whole watch face. Its absorption length must be
// based on a single diamond's diameter, measured in the pavé parent's units.
import {readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const file=resolve(dirname(require.resolve('ames-engine')),'../jewelry/PhysicalStudioModel.tsx');
const source=await readFile(file,'utf8');
const anchor=`const material=createPhysicalStudioGem(mesh.geometry,id,source,id.includes('diamond')?studio.diamond:studio.environment,studio.radiance,worldScale,small)`;
const replacement=`const colouredPave=typeof layout==='string' && id.includes('diamond') && id!=='stone-diamond'
      const material=colouredPave || id==='house-necklace-diamond' ? new MeshPhysicalMaterial({
        name:'AMES coloured pavé',color:source.attenuationColor.clone(),metalness:.10,
        roughness:colouredPave ? .16 : .095,ior:2.417,flatShading:true,envMap:studio.environment,envMapIntensity:.85,
        emissive:source.attenuationColor.clone(),emissiveIntensity:.23,clearcoat:.28,clearcoatRoughness:.12
      }) : createPhysicalStudioGem(mesh.geometry,id,source,id.includes('diamond')?studio.diamond:studio.environment,studio.radiance,worldScale,small)`;
if(!source.includes(replacement)){
  if(!source.includes(anchor))throw Error('Mounted gemstone renderer has changed.');
  await writeFile(file,source.replace(anchor,replacement));
}

const polished=await readFile(file,'utf8');
const polishAnchor='handPolish(p)}';
const goldPolish="if(/yellow gold/i.test(p.name)){p.envMapIntensity=1.38;p.roughness=/brushed|satin/i.test(p.name) ? .22 : .085;}handPolish(p)}";
if(!polished.includes(goldPolish)){
  if(!polished.includes(polishAnchor))throw Error('Studio polish has changed.');
  await writeFile(file,polished.replace(polishAnchor,goldPolish));
}
