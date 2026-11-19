'use client';

import {useState} from 'react';
import CameraJewellery from './CameraJewellery';

export default function SizeGuide({wrist,model,category}:{wrist:boolean;model:string;category:string}){
  const [open,setOpen]=useState(false);
  return <>
    <button type="button" disabled={!model} className="min-h-11 underline" onClick={()=>setOpen(true)}>
      {wrist?'Virtual try-on':'Try on & measure'}
    </button>
    {open && <CameraJewellery mode="wear" model={model} category={category} onClose={()=>setOpen(false)}/>}
  </>;
}
