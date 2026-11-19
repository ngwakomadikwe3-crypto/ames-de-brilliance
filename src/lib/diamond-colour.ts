/** Reuse the original geometry bytes, including meshopt data and mounted pavé layouts. */
export function colourDiamondModel(raw:ArrayBuffer, hex:string, metal='silver') {
  if (hex && !/^#[a-f\d]{6}$/i.test(hex)) throw Error('Invalid diamond colour');
  const view=new DataView(raw);
  const size=view.getUint32(12,true);
  const doc=JSON.parse(new TextDecoder().decode(new Uint8Array(raw,20,size)));
  for(const surface of doc.materials){
    if(!/white gold|yellow gold|platinum|silver|rhodium/i.test(surface.name??''))continue;
    const brushed=/brushed|satin/i.test(surface.name);
    surface.name=(brushed?'Brushed ':'Polished ')+(metal==='gold'?'yellow gold':'silver');
    surface.pbrMetallicRoughness={...surface.pbrMetallicRoughness,baseColorFactor:metal==='gold'?[.94,.62,.24,1]:[.85,.85,.83,1]};
  }
  if(hex){
  const rgb=[1,3,5].map(i=>{const x=parseInt(hex.slice(i,i+2),16)/255;return Math.max(.015,x<=.04045?x/12.92:((x+.055)/1.055)**2.4);});
  const material=doc.materials.push({name:'Custom diamond',pbrMetallicRoughness:{baseColorFactor:[1,1,1,1],metallicFactor:0,roughnessFactor:0},extensions:{KHR_materials_ior:{ior:2.417},KHR_materials_transmission:{transmissionFactor:1},KHR_materials_volume:{thicknessFactor:1,attenuationColor:rgb}}})-1;
  doc.extensionsUsed=[...new Set([...(doc.extensionsUsed||[]),'KHR_materials_ior','KHR_materials_transmission','KHR_materials_volume'])];
  for(const node of doc.nodes) {
    if (!node.extras?.ames_gemstone_id?.includes('diamond')) continue;
    node.extras.ames_gemstone_id='house-custom-diamond';
    const mesh=structuredClone(doc.meshes[node.mesh]);
    node.mesh=doc.meshes.push(mesh)-1;
    for(const primitive of mesh.primitives) primitive.material=material;
  }
  }
  const json=new TextEncoder().encode(JSON.stringify(doc));
  const padded=new Uint8Array(Math.ceil(json.length/4)*4).fill(32);
  padded.set(json);
  const header=raw.slice(0,20), tail=raw.slice(20+size);
  new DataView(header).setUint32(8,20+padded.length+tail.byteLength,true);
  new DataView(header).setUint32(12,padded.length,true);
  return new Blob([header,padded,tail],{type:'model/gltf-binary'});
}
