'use client';
import {useEffect,useState} from 'react';
import {HouseChoices} from './HouseChoices';

const necklaces=['Prong Set','Rub Over Tennis','Bow Tie','Illusion','Cluster'];
const bracelets=['Tennis','Prong Set','Bezel Set','Delicate'];
const bangles=['Claw Set','Channel Set','Pavé Set','Fancy Bangles'];
const womens=['Diamond Set','Vintage','Gemstone'];
const mens=['Diamond Set','Gemstone'];
export function useCollectionStyles(id:string){
  const kind=({'demo-pave-solitaire':'ring','ames-pear-fringe-necklace':'necklace','ames-tennis-bracelet':'bracelet'} as Record<string,string>)[id];
  const [style,setStyle]=useState('Original'),[family,setFamily]=useState(kind==='ring'?'Women’s':'Bracelets');
  const [metal,setMetal]=useState('Platinum'),[width,setWidth]=useState('3'),[stone,setStone]=useState('Natural Diamond'),[shape,setShape]=useState('Round');
  const [model,setModel]=useState({key:'',url:'',error:false});
  const key=JSON.stringify([kind,style,metal,width,stone,shape]);
  useEffect(()=>{
    if(!kind||style==='Original')return;
    let disposed=false,url='';
    import('../lib/collection-style-model').then(m=>m.makeStyleModel(kind,style,metal,Number(width),stone,shape)).then(blob=>{
      if(disposed)return;
      url=URL.createObjectURL(blob);setModel({key,url,error:false});
    }).catch(()=>{if(!disposed)setModel({key,url:'',error:true})});
    return ()=>{disposed=true;if(url)URL.revokeObjectURL(url)};
  },[kind,style,metal,width,stone,shape,key]);
  function row(label:string,value:string,items:string[],change:(v:string)=>void){
    return <HouseChoices label={label} value={value} choices={Object.fromEntries(items.map(v=>[v,label==='Band width'?v+' mm':v]))} onChange={change}/>;
  }
  const styles=kind==='necklace'?necklaces:kind==='bracelet'?(family==='Bangles'?bangles:bracelets):(family==='Men’s'?mens:womens);
  const controls=kind&&<div>
    {kind!=='necklace'&&row(kind==='ring'?'Wedding rings':'Collection',family,kind==='ring'?['Women’s','Men’s']:['Bracelets','Bangles'],v=>{setFamily(v);setStyle(kind==='ring'?'Diamond Set':v==='Bangles'?bangles[0]:bracelets[0])})}
    {row(kind==='ring'?'Ring style':kind==='necklace'?'Necklace style':'Bracelet style',style,['Original',...styles],setStyle)}
    {style!=='Original'&&<>
      {style!=='Black Zirconium'&&row('Metal',metal,['Platinum','White Gold','Yellow Gold','Rose Gold','Palladium','Black Zirconium'],setMetal)}
      {kind==='ring'&&row('Band width',width,['2','2.5','3','4','5'],setWidth)}
      {kind==='bracelet'&&row('Stone type',stone,['Natural Diamond','Gemstone'],setStone)}
      {kind==='bracelet'&&row('Stone shape',shape,['Round','Princess','Pear'],setShape)}
    </>}
  </div>;
  return {metal,configuration:[kind!=='necklace'&&family,style,metal,kind==='ring'&&width+' mm',kind==='bracelet'&&stone,kind==='bracelet'&&shape].filter(Boolean).join(' · '),controls,active:!!kind&&style!=='Original',src:model.key===key?model.url:'',error:model.key===key&&model.error,style};
}
