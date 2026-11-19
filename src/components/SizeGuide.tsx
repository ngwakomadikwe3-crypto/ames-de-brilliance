'use client';
import {useAtelierLanguage} from './AtelierLanguage';
import CameraJewellery from './CameraJewellery';
import {useState} from 'react';
export default function SizeGuide({wrist,model,category}:{wrist:boolean;model:string;category:string}){
  const [camera,setCamera]=useState<'size'|'wear'|null>(null);
  const {t}=useAtelierLanguage();
  const [mode,setMode]=useState('finger'),[raw,setRaw]=useState('');
  const diameter=!wrist && mode==='ring';
  const min=wrist?6:diameter?8:25, max=wrist?40:diameter?35:110;
  const value=Number(raw), valid=raw!=='' && value>=min && value<=max;
  const round=(v:number)=>Number(v.toFixed(1));
  return <><div className="flex flex-wrap gap-4 text-sm">{wrist && <button type="button" className="min-h-11 underline" onClick={()=>setCamera('size')}>Camera sizer</button>}<button type="button" disabled={!model} className="min-h-11 underline" onClick={()=>setCamera('wear')}>{wrist?'Virtual try-on':'Try on & measure'}</button></div>{camera && <CameraJewellery mode={camera} model={model} category={category} onClose={()=>setCamera(null)}/>}<details className="my-2 border-b border-white/15 text-sm">
    <summary className="cursor-pointer py-3">{t(wrist?'Measure your wrist':'Measure manually')}</summary>
    {!wrist && <div className="flex gap-4">{['finger','ring'].map(m=><button type="button" key={m} aria-pressed={mode===m} className="min-h-11 aria-pressed:underline" onClick={()=>{setMode(m);setRaw('');}}>{m==='finger'?'Measure finger':'Use a ring'}</button>)}</div>}
    <p>{wrist?'Wrap a tape snugly around your wrist where the piece will sit.':diameter?'Lay a well-fitting ring flat. Measure straight across the widest part inside the band.':'Wrap a narrow strip of paper comfortably around your finger. Mark where it meets, then measure the strip with a ruler.'}</p>
    <label className="my-3 flex items-center justify-between gap-2">{wrist?'Wrist circumference (cm)':diameter?'Inside diameter (mm)':'Finger circumference (mm)'}<input type="number" inputMode="decimal" step="0.1" min={min} max={max} value={raw} onChange={e=>setRaw(e.target.value)} className="min-h-11 w-20 rounded-lg bg-[#10372f] px-3"/></label>
    <p aria-live="polite" className="pb-3">{valid?(wrist?'Your wrist measures '+round(value)+' cm. Give this measurement to the jeweller for bracelet length or watch adjustment.':'Ring measurement: '+round(diameter?value:value/Math.PI)+' mm inside diameter · '+round(diameter?value*Math.PI:value)+' mm inside circumference.') : raw?'Check the measurement and units.':''}</p>
  </details></>;
}
