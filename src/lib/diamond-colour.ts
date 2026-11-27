/** Reuse the original geometry bytes, including meshopt data and mounted pavé layouts. */
/**
 * Mixed stones: the feature positions that take the colour while the rest stay diamond — the centre of a
 * solitaire, the drops of earrings and necklaces, every other stone of a tennis line, a watch's markers and
 * crown. The same rule builds the gemstone jewellery samples (scripts/build-jewellery-samples.mjs).
 */
export function isFeatureStone(name:string, tennisIndex:number) {
  if (name === 'Solitaire diamond') return true;
  if (name.startsWith('Tennis diamond')) return tennisIndex % 2 === 1;
  if (name.startsWith('Pear drop')) return true;
  return name.startsWith('Dial diamond') || name === 'Crown diamond';
}
export function colourDiamondModel(raw:ArrayBuffer, hex:string, metal='silver',leather='',featureOnly=false) {
  if (hex && !/^#[a-f\d]{6}$/i.test(hex)) throw Error('Invalid diamond colour');
  const view=new DataView(raw);
  const size=view.getUint32(12,true);
  const doc=JSON.parse(new TextDecoder().decode(new Uint8Array(raw,20,size)));
  if(leather)for(const n of doc.nodes)if(n.extras?.ames_bracelet?.kind==='watch')n.extras.ames_leather=leather;
  for(const surface of doc.materials){
    if(!/white gold|yellow gold|platinum|silver|rhodium/i.test(surface.name??''))continue;
    const brushed=/brushed|satin/i.test(surface.name);
    surface.name=(brushed?'Brushed ':'Polished ')+(metal==='gold'?'yellow gold':metal==='rose-gold'?'rose gold':'silver');
    surface.pbrMetallicRoughness={...surface.pbrMetallicRoughness,baseColorFactor:metal==='rose-gold'?[.96,.47,.36,1]:metal==='gold'?[1,.71,.30,1]:[.85,.85,.83,1]};
  }
  if(hex){
  const rgb=[1,3,5].map(i=>{const x=parseInt(hex.slice(i,i+2),16)/255;return Math.max(.015,x<=.04045?x/12.92:((x+.055)/1.055)**2.4);});
  const material=doc.materials.push({name:'Custom diamond',pbrMetallicRoughness:{baseColorFactor:[1,1,1,1],metallicFactor:0,roughnessFactor:0},extensions:{KHR_materials_ior:{ior:2.417},KHR_materials_transmission:{transmissionFactor:1},KHR_materials_volume:{thicknessFactor:1,attenuationColor:rgb}}})-1;
  doc.extensionsUsed=[...new Set([...(doc.extensionsUsed||[]),'KHR_materials_ior','KHR_materials_transmission','KHR_materials_volume'])];
  let white:number|undefined;
  const tennis=doc.nodes.filter((n:{name?:string;extras?:{ames_gemstone_id?:string}})=>n.extras?.ames_gemstone_id&&n.name?.startsWith('Tennis diamond'));
  for(const node of doc.nodes) {
    if (!node.extras?.ames_gemstone_id?.includes('diamond')) continue;
    const feature = !featureOnly || isFeatureStone(node.name??'', tennis.indexOf(node));
    // Around the coloured feature stones the band, chain or pavé is set in colourless diamonds (some house
    // models, like the all-blue solitaire, carry a tint on every stone).
    if (!feature) white ??= doc.materials.push({name:'Colourless diamond',pbrMetallicRoughness:{baseColorFactor:[1,1,1,1],metallicFactor:0,roughnessFactor:0},extensions:{KHR_materials_ior:{ior:2.417},KHR_materials_transmission:{transmissionFactor:1},KHR_materials_volume:{thicknessFactor:1,attenuationColor:[1,1,1]}}})-1;
    node.extras.ames_gemstone_id=/^(Riviera|Pear drop) diamond/i.test(node.name??'')?'house-necklace-diamond':'house-custom-diamond';
    const mesh=structuredClone(doc.meshes[node.mesh]);
    node.mesh=doc.meshes.push(mesh)-1;
    for(const primitive of mesh.primitives) primitive.material=feature?material:white!;
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
