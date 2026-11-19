'use client';
import {useEffect,useState} from 'react';
import {colourDiamondModel} from '../lib/diamond-colour';
import {useAtelierLanguage} from './AtelierLanguage';
import {diamondCuts,HouseChoices} from './HouseChoices';
export function useDiamondDesign(source:string, ring:boolean, necklace:boolean) {
  const [cut,setCut]=useState('Original'),[colour,setColour]=useState('');
  const [shape,setShape]=useState('Original');
  const model=shape!=='Original' ? source.replace(/[^/]+\.glb.*$/,'watch-'+shape.toLowerCase()+'.glb') : necklace && cut!=='Original' ? source.replace(/[^/]+\.glb.*$/,'fringe-'+cut.toLowerCase()+'.glb') : ring && cut!=='Original' ? source.replace(/[^/]+\.glb.*$/,'solitaire-'+cut.toLowerCase()+'.glb') : source;
  const [variant,setVariant]=useState({key:'',url:''}),[error,setError]=useState('');
  const [metal,setMetal]=useState('silver');
  const customised=!!colour;
  const key=model+colour+metal;
  useEffect(()=>{
    if(!customised)return;
    const abort=new AbortController();let url='';
    fetch(model,{signal:abort.signal}).then(r=>{if(!r.ok)throw Error();return r.arrayBuffer();}).then(b=>{
      if(abort.signal.aborted)return;
      url=URL.createObjectURL(colourDiamondModel(b,colour,metal));setVariant({key,url});setError('');
    }).catch(()=>{if(!abort.signal.aborted)setError(key);});
    return ()=>{abort.abort();if(url)URL.revokeObjectURL(url);};
  },[model,colour,metal,customised,key]);
  return {metal,setMetal,shape,setShape,cut,setCut,colour,setColour,src:customised?(variant.key===key?variant.url:''):metal==='gold'?model+(model.includes('?')?'&':'?')+'metal=gold':model,error:customised && error===key};
}
export function DiamondControls({design,ring,watch,necklace}:{design:ReturnType<typeof useDiamondDesign>;ring:boolean;watch:boolean;necklace:boolean}) {
  const {t}=useAtelierLanguage();
  const colours={'':watch?'Yellow & pink':'Original','#ffffff':'Colourless','#a6bcf4':'Blue','#f3cb43':'Yellow','#f18cad':'Pink','#88bc8c':'Green','#dc9253':'Orange','#a17baa':'Purple','#987358':'Brown'};
  return <details className="mt-2 border-b border-white/15 pb-1 text-sm">
    <summary className="cursor-pointer py-3">{t('Personalise')}</summary>
    {(ring || necklace) && <HouseChoices label={ring?'Centre cut':'Drop cut'} value={design.cut} choices={Object.fromEntries(['Original',...(ring?diamondCuts:['Round','Oval','Cushion'])].map(c=>[c,c]))} onChange={design.setCut}/>}
    {watch && <HouseChoices label="Case shape" value={design.shape} choices={{Original:'Original',Square:'Square',Slim:'Slim rectangle',Round:'Round'}} onChange={design.setShape}/>}
    <HouseChoices label="Metal" value={design.metal} choices={{silver:'Silver',gold:'Gold'}} onChange={design.setMetal}/>
    <HouseChoices label="Diamonds" value={design.colour} choices={colours} onChange={design.setColour}/>
  </details>;
}
