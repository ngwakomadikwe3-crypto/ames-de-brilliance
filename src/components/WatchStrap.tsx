'use client';
import {HouseChoices} from './HouseChoices';
export const leatherColours={black:'Black',cognac:'Cognac',espresso:'Espresso',burgundy:'Burgundy',navy:'Navy',forest:'Forest green'};
export function WatchStrap({strap,colour,setStrap,setColour}:{strap:string;colour:string;setStrap:(v:string)=>void;setColour:(v:string)=>void}){
 return <><HouseChoices label="Strap" value={strap} choices={{metal:'Metal bracelet',leather:'Leather strap'}} onChange={setStrap}/>
 {strap==='leather'&&<HouseChoices label="Leather colour" value={colour} choices={leatherColours} onChange={setColour}/>}</>;
}
