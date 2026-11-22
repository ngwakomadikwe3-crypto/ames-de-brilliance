// Post-process a design GLB: prefix every Nth matching stone node with "Accent " (the collection's accent choice
// recolours nodes named Accent), and optionally wrap the scene in the house root 'AMES piece (authored in mm)'
// scaled 1/1000 when the source was exported in millimetre units.
//   node scripts/accent-nodes.mjs <in.glb> <out.glb> '<regex with one numeric group>' <every> [--mm-root]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const [,, input, output, pattern, every, flag] = process.argv;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(input); let n = 0;
for (const node of doc.getRoot().listNodes()) {
  const m = node.getName().match(new RegExp(pattern));
  if (m && Number(m[1]) % Number(every) === 0) { node.setName('Accent ' + node.getName()); n++; }
}
if (flag === '--mm-root') {
  const scene = doc.getRoot().listScenes()[0];
  const root = doc.createNode('AMES piece (authored in mm)').setScale([0.001, 0.001, 0.001]);
  for (const child of scene.listChildren()) { scene.removeChild(child); root.addChild(child); }
  scene.addChild(root);
}
await io.write(output, doc); console.log('accent nodes', n, flag === '--mm-root' ? '(wrapped in the 1/1000 root)' : '');
