'use client';
import {useAtelierLanguage} from './AtelierLanguage';
import CameraJewellery from './CameraJewellery';
import {useState} from 'react';
export default function SizeGuide({wrist,model,category}:{wrist:boolean;model:string;category:string}){
  const [camera,setCamera]=useState<'size'|'wear'|null>(null);
  const {t}=useAtelierLanguage();
  const [raw,setRaw]=useState('');
  const value=Number(raw), valid=raw!=='' && value>=6 && value<=40;
  return <><div className="flex flex-wrap gap-4 text-sm">{wrist && <button type="button" className="min-h-11 underline" onClick={()=>setCamera('size')}>Camera sizer</button>}<button type="button" disabled={!model} className="min-h-11 underline" onClick={()=>setCamera('wear')}>{wrist?'Virtual try-on':'Try on & measure'}</button></div>{camera && <CameraJewellery mode={camera} model={model} category={category} onClose={()=>setCamera(null)}/>}{wrist && <details className="my-2 border-b border-white/15 text-sm">
    <summary className="cursor-pointer py-3">{t('Measure your wrist')}</summary>
    <p>Wrap a tape snugly around your wrist where the piece will sit.</p>
    <label className="my-3 flex items-center justify-between gap-2">Wrist circumference (cm)<input type="number" inputMode="decimal" step="0.1" min={6} max={40} value={raw} onChange={e=>setRaw(e.target.value)} className="min-h-11 w-20 rounded-lg bg-[#10372f] px-3"/></label>
    <p aria-live="polite" className="pb-3">{valid?'Your wrist measures '+Number(value.toFixed(1))+' cm. Give this measurement to the jeweller for bracelet length or watch adjustment.' : raw?'Check the measurement and units.':''}</p>
  </details>}</>;
}
