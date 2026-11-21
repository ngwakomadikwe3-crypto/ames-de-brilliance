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
const watchFinish = "if(hands.length){const brushed=/brushed|satin/i.test(p.name);p.envMap=brushed?studio.environment:studio.metal;p.envMapIntensity=brushed ? .92 : 1.15;p.metalness=1;p.clearcoat=0;p.roughness=brushed ? .24 : .078;}";
const roseFinish="if(/rose gold/i.test(p.name)||(new URL(url,window.location.origin).searchParams.get('metal')==='rose-gold'&&/white gold|platinum|silver|rhodium/i.test(p.name))){p.color.setRGB(.96,.47,.36);p.envMapIntensity=1.18;p.roughness=/brushed|satin/i.test(p.name) ? .24 : .10;}";
const goldPolish=watchFinish+roseFinish+"if(/yellow gold/i.test(p.name)||(new URL(url,window.location.origin).searchParams.get('metal')==='gold'&&/white gold|platinum|silver|rhodium/i.test(p.name))){p.color.setRGB(1,.59,.19);p.envMapIntensity=1.38;p.roughness=/brushed|satin/i.test(p.name) ? .22 : .085;}handPolish(p)}";
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

// Keep the transparent ring layer readable when capturing a camera fitting.
const viewerFile=resolve(dirname(file),'../renderer/JewelryViewer.tsx');
const viewer=await readFile(viewerFile,'utf8');
const capture='preserveDrawingBuffer: initialRuntime.webKitMobile === true';
const captureEnabled=capture+" || (typeof document !== 'undefined' && !!document.querySelector('[data-ring-photo]'))";
if(!viewer.includes(captureEnabled)){
  if(!viewer.includes(capture))throw Error('Viewer capture configuration has changed.');
  await writeFile(viewerFile,viewer.replace(capture,captureEnabled));
}

// Look down onto the stone along the finger instead of displaying the open shank.
const framingFile=resolve(dirname(viewerFile),'cameraFraming.ts');
const framing=await readFile(framingFile,'utf8');
if(!framing.includes("wearing: [0, 4]")){
  if(!framing.includes("setting: [35, 35]") || !framing.includes("| 'setting'"))throw Error('Ring fitting camera presets have changed.');
  await writeFile(framingFile,framing.replace("| 'setting'", "| 'setting' | 'wearing'").replace("setting: [35, 35]", "setting: [35, 35], wearing: [0, 4]"));
}
const mounted=await readFile(file,'utf8');
const stage='<StudioStage {...stage}/>';
if(mounted.includes('    '+stage)){
  await writeFile(file,mounted.replace('    '+stage, "    {!gl.domElement.closest('[data-ring-photo]') && "+stage+"}"));
}

// The invisible surface writes depth only. Near-side stones remain visible
// while the far side of the band passes behind the camera image of the limb.
const fitFraming=await readFile(framingFile,'utf8');
if(!fitFraming.includes('wrist_fit:')){
  await writeFile(framingFile,fitFraming.replace("| 'wearing'", "| 'wearing' | 'wrist_fit'").replace('wearing: [0, 4]', 'wearing: [0, 4], wrist_fit: [0, 90]'));
}
const fitSource=await readFile(file,'utf8');
const pivotTag='<group ref={pivot} name="ames-physical-turntable"';
if(!fitSource.includes('name="ames-limb-depth"')){
  if(!fitSource.includes(pivotTag))throw Error('Missing try-on turntable');
  await writeFile(file,fitSource.replace(pivotTag,`{gl.domElement.closest('[data-fit-piece]') && <mesh name="ames-limb-depth" renderOrder={-100} rotation={gl.domElement.closest('[data-fit-piece="ring"]')?[-Math.PI/2,0,0]:[0,0,0]}>
      <planeGeometry args={[5,5]}/><meshBasicMaterial colorWrite={false} depthWrite toneMapped={false}/>
    </mesh>}
    `+pivotTag));
}

// The solitaire's band is authored in the XY plane, with its shoulders toward +Y.
const ringStudio=await readFile(file,'utf8');
const afterMaterials='materials.push(...assignment.materials)';
const beforeCrystal='// A dielectric watch crystal';
const goldRingFinish=`
    if(root.getObjectByName('Solitaire_diamond') || gems.some(g=>/solitaire/i.test(g.name))){
      const selectedGold=new URL(url,window.location.origin).searchParams.get('metal')==='gold';
      root.traverse(object=>{
        if(!(object instanceof Mesh) || !/comfort.*band|claw|gallery.*rail|head.*foot|pav.*bead/i.test(object.name))return
        for(const material of Array.isArray(object.material)?object.material:[object.material]){
          const p=material as MeshPhysicalMaterial
          if(!p.isMeshPhysicalMaterial || p.metalness<.9 || !(selectedGold || /yellow gold/i.test(p.name)))continue
          p.color.setRGB(.98,.64,.23);p.metalness=1;p.clearcoat=0;p.envMap=studio.metal;p.envMapIntensity=1.12;p.roughness=.075
          if(!/comfort.*band/i.test(object.name))continue
          const polish=p.onBeforeCompile.bind(p)
          p.onBeforeCompile=(shader,renderer)=>{
            polish(shader,renderer)
            shader.fragmentShader=shader.fragmentShader.replace('#include <metalnessmap_fragment>', [
              'float amesShoulder=smoothstep(.17,.75,vAmesPos.y/max(length(vAmesPos.xy),1.e-6));',
              'float grainPhase=atan(vAmesPos.y,vAmesPos.x)*62.0+vAmesPos.z*8500.;',
              'float brushedLine=.5+.5*sin(grainPhase)/(1.+fwidth(grainPhase));',
              'roughnessFactor+=amesShoulder*(.065+.025*brushedLine);',
              '#include <metalnessmap_fragment>'
            ].join('\\n'))
          }
          p.customProgramCacheKey=()=>'ames-yellow-gold-band-v1'
        }
      })
    }
    `;
if(!ringStudio.includes('ames-yellow-gold-band-v1')){
  if(!ringStudio.includes(afterMaterials)||!ringStudio.includes(beforeCrystal))throw Error('Missing studio material pass');
  await writeFile(file,ringStudio.replace(beforeCrystal,goldRingFinish+beforeCrystal));
}

// Reuse the articulated-chain solver on open necklaces and tennis bracelets.
const chainSource=await readFile(file,'utf8');
const foldSwitch="el.dataset.amesFoldable='false'";
if(chainSource.includes(foldSwitch)){
  const grab="if(k<0||!grab||k===pinned)return";
  if(!chainSource.includes(grab))throw Error('Chain grab handler missing');
  await writeFile(file,chainSource.replace(foldSwitch,`const flexibleChain=!hinged && links.length>2;
    el.dataset.amesFoldable=flexibleChain?'unclasped':'false';
    if(flexibleChain)host.addEventListener('pointerdown',onDown,{capture:true})`).replace(grab,"if(flatProgress.current!==1||k<0||!grab||k===pinned)return"));
} else if(!chainSource.includes("const flexibleChain=!hinged"))throw Error('Chain interaction hook missing');

// Keep small printed numerals sharp through the crystal at Boutique thumbnail scale.
const watchStudio = await readFile(file, 'utf8');
if (!watchStudio.includes('const watchFaceMeshes =')) {
  const materialPass = 'const assignment=applyJewelryMaterials';
  const preserve = 'preserveMesh:mesh=>gems.includes(mesh)';
  const crystal = 'envMap:studio.metal,envMapIntensity:1,transmission:1,thickness:0,ior:1.77,clearcoat:0';
  for (const anchor of [materialPass, preserve, crystal]) {
    if (!watchStudio.includes(anchor)) throw Error('Watch face renderer changed: ' + anchor);
  }
  const faceMaterials = `
    const watchFaceMeshes = new Set<Mesh>()
    if (hands.length) root.traverse(object => {
      if (!(object instanceof Mesh)) return
      const original = object.material as MeshPhysicalMaterial
      let finish: Material
      if (object.name === 'Dial' && original.map) {
        finish = new MeshBasicMaterial({ map: original.map, color: 0xf5f2ec, toneMapped: false })
      } else if (/^(Hour|Minute|Second)[_ ]hand[_ ]mesh$/i.test(object.name)) {
        finish = new MeshPhysicalMaterial({ color: 0x142743, metalness: .22, roughness: .38 })
      } else return
      object.material = finish
      watchFaceMeshes.add(object)
      materials.push(finish)
    })
    `;
  await writeFile(file, watchStudio.replace(materialPass, faceMaterials + materialPass)
    .replace(preserve, preserve + ' || watchFaceMeshes.has(mesh)')
    .replace(crystal, 'envMap:studio.metal,envMapIntensity:.25,transparent:true,opacity:.035,depthWrite:false,clearcoat:0'));
}
