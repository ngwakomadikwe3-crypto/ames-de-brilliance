// The merged bezel spans the whole watch face. Its absorption length must be
// based on a single diamond's diameter, measured in the pavé parent's units.
import {readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const file=resolve(dirname(require.resolve('ames-engine')),'../jewelry/PhysicalStudioModel.tsx');
const source=await readFile(file,'utf8');
const anchor=`const material=createPhysicalStudioGem(mesh.geometry,id,source,id.includes('diamond')?studio.diamond:studio.environment,studio.radiance,worldScale,small)`;
const replacement=anchor.replace('mesh.geometry,id,source', "mesh.geometry,(hands.length && id.includes('diamond'))?'watch-'+id:id,source")+`
      if(typeof layout==='string' && mesh.parent){
        const record=Uint8Array.from(atob(layout).slice(0,32),c=>c.charCodeAt(0))
        if(record.length===32){
          const diameter=new DataView(record.buffer).getFloat32(28,true)*mesh.parent.getWorldScale(new Vector3()).length()/Math.sqrt(3)*scale
          if(diameter>0)material.attenuationDistance=diameter*.70
        }
      }`;
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

// Keep a little coloured studio fill in dark internal paths while retaining the
// physical reflection and refraction on the triangular faces.
const gemFile=resolve(dirname(file),'../materials/PhysicalStudioGem.ts');
const gemSource=await readFile(gemFile,'utf8');
const lighting='totalDiffuse = transmitted * (1.-faceF);';
const filled='totalDiffuse = (transmitted + 0.055 * attenuationColor) * (1.-faceF);';
if(!gemSource.includes(filled)){
  if(!gemSource.includes(lighting))throw Error('Studio gem shader has changed.');
  await writeFile(gemFile,gemSource.replace(lighting,filled));
}

const studioGem=await readFile(gemFile,'utf8');
const reflection='return textureCubeUV(envMap, envMapRotation * d, amesSoftness).rgb * (1. - head);';
const watchReflection=`vec3 room=textureCubeUV(envMap,envMapRotation*d,amesSoftness).rgb*(1.-head);
        \${id.startsWith('watch-') ? \`float strip=pow(max(dot(d,normalize(vec3(-.58,.65,.49))),0.),64.);
        float spot=pow(max(dot(d,normalize(vec3(.72,.32,-.55))),0.),150.);
        room+=vec3(.10)+vec3(1.,.98,.94)*(2.6*strip+3.8*spot);\` : ''}
        return room;`;
const cacheKey="ames-physical-bvh-v8-${smooth ? 's' : 'f'}";
const watchKey=cacheKey+"-${id.startsWith('watch-')?'watch':'studio'}";
if(!studioGem.includes(watchReflection)){
  if(!studioGem.includes(reflection)||!studioGem.includes(cacheKey))throw Error('Watch lighting hooks have changed.');
  await writeFile(gemFile,studioGem.replace(reflection,watchReflection).replace(cacheKey,watchKey));
}
