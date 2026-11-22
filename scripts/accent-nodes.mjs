import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const [,, input, output, pattern, every] = process.argv;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(input); let n = 0;
for (const node of doc.getRoot().listNodes()) {
  const m = node.getName().match(new RegExp(pattern));
  if (m && Number(m[1]) % Number(every) === 0) { node.setName('Accent ' + node.getName()); n++; }
}
await io.write(output, doc); console.log('accent nodes', n);
