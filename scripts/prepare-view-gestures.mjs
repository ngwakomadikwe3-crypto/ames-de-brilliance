import {copyFileSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
const dir=path.resolve('node_modules/ames-engine/src/engine/renderer');
const file=path.join(dir,'ViewerControls.tsx');
const source=readFileSync(file,'utf8');
copyFileSync(new URL('../src/engine-adapters/useViewGesture.tsx.txt',import.meta.url),path.join(dir,'useViewGesture.tsx'));
if(!source.includes("from './useViewGesture'")){
 const marker='  const camera = useThree';
 if(!source.includes(marker))throw Error('Unsupported AMES engine controls');
 writeFileSync(file,"import {useViewGesture} from './useViewGesture'\n"+source.replace(marker,'  useViewGesture(controls,cameraPreset,zoom)\n'+marker));
}

copyFileSync(new URL('../src/lib/showcase-motion.ts',import.meta.url),path.join(dir,'showcase-motion.ts'));
copyFileSync(new URL('../src/engine-adapters/showcase-turntable.ts.txt',import.meta.url),path.join(dir,'useControlledTurntable.ts'));

// Polished metal: an HDR softbox studio (src/lib/metal-studio-env.ts) for every live jewellery model, split
// roughness by finish, and ACES exposure 1.1 (see the metal realism brief).
copyFileSync(new URL('../src/lib/metal-studio-env.ts',import.meta.url),path.join(dir,'metalStudioEnvironment.ts'));
copyFileSync(new URL('../src/engine-adapters/useMetalStudioEnvironment.ts.txt',import.meta.url),path.join(dir,'useMetalStudioEnvironment.ts'));
// Metal materials get the softbox studio; stones keep their own environment (the ray-marched gems need theirs).
const modelPath=path.resolve('node_modules/ames-engine/src/engine/jewelry/JewelryGlbModel.tsx');
let modelSource=readFileSync(modelPath,'utf8');
if(!modelSource.includes('useMetalStudioEnvironment')){
 const at=modelSource.indexOf('for (const material of materials) material.dispose()');
 const close=at<0?-1:modelSource.indexOf('}, [materials])',at);
 if(close<0)throw Error('Unsupported AMES engine model');
 const eol=modelSource.indexOf('\n',close)+1;
 const insert="  const metalStudio = useMetalStudioEnvironment(true)\n  useEffect(() => {\n    if (!metalStudio) return\n    for (const material of materials) {\n      const metal = material as MeshPhysicalMaterial\n      if (metal.name?.endsWith('::enhanced') && metal.metalness >= 0.9) { metal.envMap = metalStudio; metal.needsUpdate = true }\n    }\n  }, [materials, metalStudio])\n";
 modelSource="import {useMetalStudioEnvironment} from '../renderer/useMetalStudioEnvironment'\n"+modelSource.slice(0,eol)+insert+modelSource.slice(eol);
 writeFileSync(modelPath,modelSource);
}
const materialsPath=path.resolve('node_modules/ames-engine/src/engine/jewelry/jewelryGlbMaterials.ts');
let materials=readFileSync(materialsPath,'utf8');
const roughnessRule="roughness: /brushed|satin|matte|frosted|hammered/i.test(source?.name ?? '') ? Math.max(.18, (source as MeshStandardMaterial)?.roughness ?? .34) : optics.roughness,";
if(materials.includes(roughnessRule)){
 materials=materials.replace(roughnessRule,"roughness: /brushed|satin|matte|frosted|hammered/i.test(source?.name ?? '') ? Math.min(.45, Math.max(.3, (source as MeshStandardMaterial)?.roughness ?? .36)) : Math.min(.15, Math.max(.06, optics.roughness)),")
  .replace("    envMapIntensity: optics.envMapIntensity,\n    envMap: envMap ?? null,","    envMapIntensity: Math.min(1.3, Math.max(1, optics.envMapIntensity)),\n    envMap: envMap ?? null,");
 writeFileSync(materialsPath,materials);
}else if(!materials.includes('Math.min(.45, Math.max(.3,'))throw Error('Unsupported AMES engine metal material');
const viewerPath=path.join(dir,'JewelryViewer.tsx');
let viewer=readFileSync(viewerPath,'utf8');
if(viewer.includes('gl.toneMappingExposure = DIAMOND_TONE_MAPPING_EXPOSURE'))writeFileSync(viewerPath,viewer.replace('gl.toneMappingExposure = DIAMOND_TONE_MAPPING_EXPOSURE','gl.toneMappingExposure = 1.1'));

// Watch crystals over stones (ames_glass: 'over-stones', e.g. the W1 pavé dial): a clear, reflective crystal that
// does not use transmission, because three.js does not draw transmissive gems behind another transmissive surface.
{
 const studioPath=path.resolve('node_modules/ames-engine/src/engine/jewelry/PhysicalStudioModel.tsx');
 let studio=readFileSync(studioPath,'utf8');
 if(!studio.includes("'over-stones'")){
  const crystal=/const glass=new MeshPhysicalMaterial\(\{name:'AMES sapphire watch crystal'[^}]*\}\)/;
  const found=studio.match(crystal);
  if(!found)throw Error('Unsupported AMES engine watch crystal');
  studio=studio.replace(crystal,"const overStones=(m.userData.ames_glass??m.parent?.userData.ames_glass)==='over-stones'\n      const glass=overStones?new MeshPhysicalMaterial({name:'AMES sapphire watch crystal (over stones)',color:0xffffff,metalness:0,roughness:.015,envMap:studio.metal,envMapIntensity:1,ior:1.77,transparent:true,opacity:.08,depthWrite:false}):"+found[0].replace('const glass=',''));
  writeFileSync(studioPath,studio);
 }
}

// Detachable parts (convertible earrings): the page sends 'ames:hide' {names} to the canvas; every node named so, or
// named so plus '_…', is hidden, and shown again when a later message leaves it out.
{
 const studioPath=path.resolve('node_modules/ames-engine/src/engine/jewelry/PhysicalStudioModel.tsx');
 let studio=readFileSync(studioPath,'utf8');
 if(!studio.includes("'ames:hide'")){
  const anchor="  // Opening: the page sends 'ames:open' {open}";
  if(!studio.includes(anchor))throw Error('Unsupported AMES engine: no opening handler to anchor ames:hide');
  studio=studio.replace(anchor,"  // Hiding: the page sends 'ames:hide' {names}; nodes with those names (or name + '_…') are hidden, the rest shown.\n  useEffect(()=>{const el=gl.domElement\n    const onMessage=(e:Event)=>{const names:string[]=(e as CustomEvent).detail?.names??[]\n      built.root.traverse(o=>{const hit=names.some(x=>o.name===x||o.name.startsWith(x+'_'));if(hit)o.visible=false;else if(o.userData.amesHidden)o.visible=true;o.userData.amesHidden=hit})\n      invalidate()}\n    el.addEventListener('ames:hide',onMessage);return()=>el.removeEventListener('ames:hide',onMessage)},[built,gl,invalidate])\n"+anchor);
  writeFileSync(studioPath,studio);
 }
}
