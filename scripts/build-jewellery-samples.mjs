import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { NodeIO, Accessor } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder,
});
const base = 'public/ames-engine';
const output = base + '/jewellery-samples';
await mkdir(output, { recursive: true });
const registry = JSON.parse(await readFile('src/lib/house-gemstones.json', 'utf8'));
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
function unpack(bytes) {
  const size = bytes.readUInt32LE(12);
  return { doc: JSON.parse(bytes.subarray(20, 20 + size)), binary: bytes.subarray(28 + size) };
}
const templates = { ring: 'demo-pave-solitaire', bracelet: 'ames-tennis-bracelet', earrings: 'ames-pear-drop-earrings', watch: 'ames-iced-watch' };
for (const cut of ['pear','round','oval','cushion']) templates['necklace-'+cut]='ames-pear-fringe-necklace';
for (const [setting, asset] of Object.entries(templates)) {
  const record = await readJson(base + '/' + asset + '/app/boutique.json');
  const input = base + '/' + asset + '/' + (setting === 'ring' ? 'web/solitaire-ice-blue.glb' : setting === 'watch' ? 'web/watch-v8.glb' : setting.startsWith('necklace-') && setting !== 'necklace-pear' ? 'web/fringe-'+setting.slice(9)+'.glb' : record.interactiveGlb);
  const model = await io.read(input);
  const root = model.getRoot();
  if(setting==='watch'){
    const head=root.listNodes().find(node=>node.getName()==='Watch head');
    const crown=root.listNodes().find(node=>node.getName()==='Crown diamond');
    for(let hour=0;hour<12;hour++){
      const angle=hour*Math.PI/6;
      head.addChild(model.createNode().setMesh(crown.getMesh()).setExtras({...crown.getExtras()}).setName('Dial diamond '+(hour||12)).setTranslation([12.1*Math.sin(angle),12.1*Math.cos(angle),6.58]).setRotation([Math.SQRT1_2,0,0,Math.SQRT1_2]).setScale([.93,.78,.93]));
    }
  }
  const gems = root.listNodes().filter(n => n.getExtras().ames_gemstone_id);
  if (!gems.length) throw Error('Missing gemstones: ' + asset);
  for (const node of gems) {
    for (const primitive of node.getMesh().listPrimitives()) {
      if (primitive.getAttribute('TEXCOORD_0')) continue;
      const position = primitive.getAttribute('POSITION');
      const min = position.getMin([]), max = position.getMax([]);
      const uv = new Float32Array(position.getCount() * 2);
      for (let i = 0; i < position.getCount(); i++) {
        const p = position.getElement(i, []);
        uv.set([0, 2].map(axis => (p[axis] - min[axis]) / (max[axis] - min[axis] || 1)), i * 2);
      }
      primitive.setAttribute('TEXCOORD_0', model.createAccessor().setType(Accessor.Type.VEC2).setArray(uv).setBuffer(position.getBuffer()));
    }
  }
  // All variants share one geometry payload per setting.
  const { doc: template, binary } = unpack(Buffer.from(await io.writeBinary(model)));
  await writeFile(output + '/' + setting + '.bin', binary);
  template.buffers[0].uri = setting + '.bin';
  for (const stone of [...registry, ...(setting === 'ring' ? [{ id: 'ice-blue' }] : [])]) {
    const blue = stone.id === 'ice-blue';
    const doc = blue ? unpack(await readFile(input)).doc : structuredClone(template);
    if(setting==='ring'){
      const centre=doc.nodes.find(node=>node.name==='Solitaire diamond');
      centre.scale=(centre.scale||[1,1,1]).map((v,i)=>i===1?v:v*1.04);
      for(const claw of doc.nodes.filter(node=>node.name?.startsWith('Claw ')))claw.scale=[.97,1,.97];
    }
    let material, mode, id;
    if (stone.id === 'ice-blue') {
      material = doc.materials.find(m => m.name.includes('Ice blue'));
      mode = 'closed-dielectric-visual'; id = 'stone-ice-blue-diamond';
    } else {
      const source = unpack(await readFile(base + '/' + stone.id + '/web/jewelry.glb')).doc;
      const original = source.nodes.find(n => n.extras?.ames_gemstone_id);
      id = stone.id; mode = original.extras.ames_optical_mode;
      material = source.materials[source.meshes[original.mesh].primitives[0].material];
      const imageOffset = (doc.images ??= []).length, samplerOffset = (doc.samplers ??= []).length, textureOffset = (doc.textures ??= []).length;
      for (const [i, image] of (source.images || []).entries()) {
        const ext = {'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[image.mimeType];
        doc.images.push({uri: '../gallery-cuts/textures/' + id + '-' + i + '.' + ext});
      }
      doc.samplers.push(...source.samplers || []);
      for (const texture of source.textures || []) doc.textures.push({...texture, source: texture.source + imageOffset, ...(texture.sampler !== undefined ? {sampler:texture.sampler + samplerOffset} : {})});
      function offsetTextures(obj) {
        for (const [key, value] of Object.entries(obj)) if (value && typeof value === 'object') {
          if (key.endsWith('Texture')) value.index += textureOffset; else offsetTextures(value);
        }
      }
      offsetTextures(material);
      doc.extensionsUsed = [...new Set([...doc.extensionsUsed || [], ...Object.keys(material.extensions || {})])];
      for (const key of ['images','textures','samplers']) if (!doc[key].length) delete doc[key];
    }
    const index = doc.materials.push(material) - 1;
    for (const node of doc.nodes.filter(n => n.extras?.ames_gemstone_id)) {
      Object.assign(node.extras, {ames_gemstone_id:id, ames_optical_mode:mode});
      for (const primitive of doc.meshes[node.mesh].primitives) primitive.material = index;
    }
    if (blue) {
      const original = await readFile(input);
      const tail = original.subarray(20 + original.readUInt32LE(12));
      const json = Buffer.from(JSON.stringify(doc));
      const padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 32);
      json.copy(padded);
      const header = Buffer.from(original.subarray(0,20));
      header.writeUInt32LE(20 + padded.length + tail.length,8);
      header.writeUInt32LE(padded.length,12);
      await writeFile(base + '/' + asset + '/web/solitaire-all-blue.glb',Buffer.concat([header,padded,tail]));
      continue;
    }
    await writeFile(output + '/' + stone.id + '-' + setting + '.gltf', JSON.stringify(doc));
  }
}
