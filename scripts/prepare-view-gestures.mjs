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

// Animate the model pivot as well as the orbit when a reset token changes.
const turnFile=path.join(dir,'useControlledTurntable.ts');
const turn=readFileSync(turnFile,'utf8');
const snap='    if (pivot.current) pivot.current.rotation.y = 0';
if(turn.includes(snap))writeFileSync(turnFile,turn.replace(snap,`    let restoring=0
    const start=performance.now()
    const angle=pivot.current?.rotation.y??0
    const shortest=Math.atan2(Math.sin(angle),Math.cos(angle))
    const restore=(now:number)=>{
      const t=Math.min(1,(now-start)/240)
      if(pivot.current)pivot.current.rotation.y=shortest*(1-t*t*(3-2*t))
      invalidate()
      if(t<1)restoring=requestAnimationFrame(restore)
    }
    if(shortest)restoring=requestAnimationFrame(restore)`).replace('  }, [pivot, resetToken, invalidate])','    return ()=>cancelAnimationFrame(restoring)\n  }, [pivot, resetToken, invalidate])'));
