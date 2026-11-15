// Re-apply meshopt compression (as the original AMES files ship) so the new
// stone files load as quickly as the ones they replace.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { reorder, quantize } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import fs from 'node:fs';
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
for (const [src, dst] of process.argv.slice(2).map(a => a.split('='))) {
  const doc = await io.read(src), before = fs.statSync(src).size;
  await doc.transform(reorder({ encoder: MeshoptEncoder }), quantize({ quantizePosition: 16, quantizeNormal: 10, quantizeTexcoord: 14 }));
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
  await io.write(dst, doc);
  console.log(`${src.split('/').pop().padEnd(32)} ${(before / 1024 | 0)} KB -> ${(fs.statSync(dst).size / 1024 | 0)} KB`);
}
