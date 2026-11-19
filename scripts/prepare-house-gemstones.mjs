import {readFile,writeFile,mkdir} from 'node:fs/promises';
import sharp from 'sharp';
const registry=JSON.parse(await readFile('src/lib/house-gemstones.json','utf8'));
for(const stone of registry.filter(s=>s.sourceId)){
  const source='public/ames-engine/'+stone.sourceId+'/web/';
  const target='public/ames-engine/'+stone.id+'/web/';
  await mkdir(target,{recursive:true});
  const bytes=await readFile(source+'jewelry.glb'), length=bytes.readUInt32LE(12);
  const doc=JSON.parse(bytes.subarray(20,20+length)),tail=bytes.subarray(20+length);
  const rgb=[1,3,5].map(i=>parseInt(stone.tint.slice(i,i+2),16)/255);
  const linear=rgb.map(c=>((c+.055)/1.055)**2.4);
  for(const node of doc.nodes.filter(n=>n.extras?.ames_gemstone_id)){
    node.name=stone.name;node.extras.ames_gemstone_id=stone.id;
    for(const prim of doc.meshes[node.mesh].primitives){
      const mat=doc.materials[prim.material];mat.name=stone.name;
      mat.pbrMetallicRoughness.baseColorFactor=[...linear,1];
      if(stone.id==='stone-coral')mat.pbrMetallicRoughness.metallicFactor=0;
      if(node.extras.ames_optical_mode==='closed-dielectric-visual'){
        (mat.extensions??={}).KHR_materials_volume={attenuationColor:linear,thicknessFactor:1};
        doc.extensionsUsed=[...new Set([...doc.extensionsUsed||[],'KHR_materials_volume'])];
      }
    }
  }
  const json=Buffer.from(JSON.stringify(doc)),padded=Buffer.alloc(Math.ceil(json.length/4)*4,32),header=Buffer.from(bytes.subarray(0,20));
  json.copy(padded);header.writeUInt32LE(padded.length,12);header.writeUInt32LE(20+padded.length+tail.length,8);
  await writeFile(target+'jewelry.glb',Buffer.concat([header,padded,tail]));
  const image=sharp(source+'poster.webp');
  if(stone.id==='stone-black-opal')image.modulate({brightness:.63,saturation:1.2});
  else image.tint(stone.tint);
  await image.webp({quality:92}).toFile(target+'poster.webp');
}
