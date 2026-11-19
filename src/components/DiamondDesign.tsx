'use client';
import {useEffect,useState} from 'react';
import {colourDiamondModel} from '../lib/diamond-colour';
import {diamondCuts,HouseChoices} from './HouseChoices';
export function useDiamondDesign(source:string, ring:boolean) {
  const [cut,setCut]=useState('Original'),[colour,setColour]=useState('');
  const model=ring && cut!=='Original' ? source.replace(/[^/]+\.glb.*$/,'solitaire-'+cut.toLowerCase()+'.glb') : source;
  const [variant,setVariant]=useState({key:'',url:''}),[error,setError]=useState('');
  const key=model+colour;
  useEffect(()=>{
    if(!colour)return;
    const abort=new AbortController();let url='';
    fetch(model,{signal:abort.signal}).then(r=>{if(!r.ok)throw Error();return r.arrayBuffer();}).then(b=>{
      if(abort.signal.aborted)return;
      url=URL.createObjectURL(colourDiamondModel(b,colour));setVariant({key,url});setError('');
    }).catch(()=>{if(!abort.signal.aborted)setError(key);});
    return ()=>{abort.abort();if(url)URL.revokeObjectURL(url);};
  },[model,colour,key]);
  return {cut,setCut,colour,setColour,src:colour?(variant.key===key?variant.url:''):model,error:!!colour && error===key};
}
export function DiamondControls({design,ring,watch}:{design:ReturnType<typeof useDiamondDesign>;ring:boolean;watch:boolean}) {
  const colours:Record<string,string>={'':watch?'Yellow & pink':'Original','#a6bcf4':'Ice blue','#f8d65a':'Yellow','#f39fc0':'Pink','#ffffff':'White'};
  if(!(design.colour in colours))colours[design.colour]='Custom';
  return <div>{ring && <HouseChoices label="Centre cut" value={design.cut} choices={Object.fromEntries(['Original',...diamondCuts].map(c=>[c,c]))} onChange={design.setCut}/>}
    <HouseChoices label="Diamond colour" value={design.colour} choices={colours} onChange={design.setColour}/>
    <label className="inline-flex min-h-11 items-center gap-2 text-xs">Custom colour<input aria-label="Custom diamond colour" type="color" value={design.colour||'#a6bcf4'} onChange={e=>design.setColour(e.target.value)} /></label>
  </div>;
}
