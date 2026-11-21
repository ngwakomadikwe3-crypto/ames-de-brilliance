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
