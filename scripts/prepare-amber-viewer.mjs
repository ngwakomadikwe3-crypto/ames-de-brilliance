import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

// The interactive cabochon must load without a runtime meshopt decoder.
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const folder = 'public/ames-engine/stone-amber/web';
const document = await io.read(folder + '/jewelry.glb');
for (const extension of document.getRoot().listExtensionsUsed()) {
  if (extension.extensionName === 'EXT_meshopt_compression') extension.dispose();
}
await io.write(folder + '/interactive.glb', document);
