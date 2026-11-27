'use client';
import {WatchStrap} from './WatchStrap';
import {useEffect,useState} from 'react';
import {colourDiamondModel} from '../lib/diamond-colour';
import {useAtelierLanguage} from './AtelierLanguage';
import {diamondCuts,HouseChoices} from './HouseChoices';
export function useDiamondDesign(source:string, ring:boolean, necklace:boolean) {
  const [cut,setCut]=useState('Original'),[colour,setColour]=useState(''),[mixed,setMixed]=useState('');
  const [shape,setShape]=useState(source.includes('/ames-iced-watch/')?'Square':'Original');
  const model=shape!=='Original' ? source.replace(/[^/]+\.glb.*$/,'watch-'+shape.toLowerCase()+'.glb') : necklace && cut!=='Original' ? source.replace(/[^/]+\.glb.*$/,'fringe-'+cut.toLowerCase()+'.glb') : ring && cut!=='Original' ? source.replace(/[^/]+\.glb.*$/,'solitaire-'+cut.toLowerCase()+'.glb') : source;
  const [variant,setVariant]=useState({key:'',url:''}),[error,setError]=useState('');
  const [metal,setMetal]=useState('silver');
  const [strap,setStrap]=useState('metal'),[leather,setLeather]=useState('cognac');
  const strapQuery=strap==='leather'?'leather='+leather:'';
  const modelUrl=model+([metal!=='silver'?'metal='+metal:'',strapQuery].filter(Boolean).length?(model.includes('?')?'&':'?')+[metal!=='silver'?'metal='+metal:'',strapQuery].filter(Boolean).join('&'):'');
  const customised=!!colour;
  const key=model+colour+metal+strapQuery+mixed;
  useEffect(()=>{
    if(!customised)return;
    const abort=new AbortController();let url='';
    fetch(model,{signal:abort.signal}).then(r=>{if(!r.ok)throw Error();return r.arrayBuffer();}).then(b=>{
      if(abort.signal.aborted)return;
      url=URL.createObjectURL(colourDiamondModel(b,colour,metal,strap==='leather'?leather:'',!!mixed));setVariant({key,url});setError('');
    }).catch(()=>{if(!abort.signal.aborted)setError(key);});
    return ()=>{abort.abort();if(url)URL.revokeObjectURL(url);};
  },[model,colour,metal,customised,key,strap,leather,mixed]);
  return {mixed,setMixed,strap,setStrap,leather,setLeather,metal,setMetal,shape,setShape,cut,setCut,colour,setColour,src:customised?(variant.key===key?variant.url:''):modelUrl,error:customised && error===key};
}
export const diamondColourNames:Record<string,string>={'#ffffff':'Colourless','#a6bcf4':'Blue','#f3cb43':'Yellow','#f18cad':'Pink','#88bc8c':'Green','#dc9253':'Orange','#a17baa':'Purple','#987358':'Brown'};
const metalNames:Record<string,string>={silver:'Silver',gold:'Gold','rose-gold':'Rose gold'};
/** The customer's choices in words, for the one-line summary beside "Make it yours". */
export function designSummary(design:ReturnType<typeof useDiamondDesign>, {ring,watch,necklace}:{ring:boolean;watch:boolean;necklace:boolean}) {
  return [(ring||necklace)&&design.cut!=='Original'&&design.cut+' cut', metalNames[design.metal]??design.metal, design.colour?(diamondColourNames[design.colour]??'Coloured')+(design.mixed?' centre, diamonds around':' stones'):'', watch&&design.shape, watch&&design.strap==='leather'&&'Leather strap'].filter(Boolean).join(' · ');
}
export function DiamondControls({design,ring,watch,necklace}:{design:ReturnType<typeof useDiamondDesign>;ring:boolean;watch:boolean;necklace:boolean}) {
  const {t}=useAtelierLanguage();
  const colours={...diamondColourNames,'':watch?'Diamond, pink & yellow sapphire':'Original','#ffffff':'Colourless','#a6bcf4':'Blue','#f3cb43':'Yellow','#f18cad':'Pink','#88bc8c':'Green','#dc9253':'Orange','#a17baa':'Purple','#987358':'Brown'};
  // Shown inside the "Make it yours" sheet, so the choices are listed directly (no extra Personalise fold).
  return <div className="text-sm" data-personalise>
    {(ring || necklace) && <HouseChoices label={ring?'Centre cut':'Drop cut'} value={design.cut} choices={Object.fromEntries(['Original',...(ring?diamondCuts:['Round','Oval','Cushion'])].map(c=>[c,c]))} onChange={design.setCut}/>}
    {watch && <WatchStrap strap={design.strap} setStrap={design.setStrap} colour={design.leather} setColour={design.setLeather}/>}
    {watch && <HouseChoices label="Case shape" value={design.shape} choices={{Original:'Original',Square:'Square',Slim:'Slim rectangle',Round:'Round'}} onChange={design.setShape}/>}
    <HouseChoices label="Metal" value={design.metal} choices={{silver:'Silver',gold:'Gold','rose-gold':'Rose gold'}} onChange={design.setMetal}/>
    <HouseChoices label="Diamonds" value={design.colour} choices={colours} onChange={design.setColour}/>
    {/* Mixed stones: the colour on the feature stones only, diamonds kept around them. */}
    {design.colour && design.colour!=='#ffffff' && <HouseChoices label="Colour on" value={design.mixed} choices={{'':'Every stone',mixed:ring?'Centre stone, diamond band':watch?'Markers and crown, diamond pavé':necklace?'Drops, diamond chain':'Feature stones, with diamonds'}} onChange={design.setMixed}/>}
  </div>;
}
