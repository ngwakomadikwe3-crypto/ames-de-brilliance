'use client';
import {useEffect, useState} from 'react';

export default function JewellerStudioPreview({direct=false}:{direct?:boolean}) {
  const [step, setStep] = useState(direct?1:0);
  const [maker,setMaker] = useState(direct?"Sample atelier":''), [piece,setPiece] = useState(direct?"Pear drop earrings":''), [details,setDetails] = useState(direct?"White gold, pear-cut diamonds, 30 mm drop.":'');
  const [supplier,setSupplier] = useState(direct?"Sample manufacturer":''), [quote,setQuote] = useState(direct?"4000":''), [markup,setMarkup] = useState(direct?"25":'');
  const [image,setImage] = useState(direct?"/ames-engine/ames-pear-drop-earrings/web/poster-v2.webp":''), [feedback,setFeedback] = useState('');
  useEffect(() => () => { if(image.startsWith("blob:")) URL.revokeObjectURL(image); }, [image]);
  const label = ['Your studio','Upload a piece','Staff review','Customer storefront'][step];
  const retail = new Intl.NumberFormat('en-BW',{style:'currency',currency:'BWP'}).format(Number(quote)*(1+Number(markup)/100));
  const field = 'block w-full mt-1 rounded-lg border bg-transparent p-2';
  return <details open={direct||undefined} className="rounded-xl border p-4"><summary className="cursor-pointer">Try the jeweller studio without signing in</summary>
    <p className="my-3 text-sm">Practice with sample details. This preview stays in this tab. Sample prices are illustrative. Nothing here is submitted or published.</p>
    <form className="space-y-3" onSubmit={e=>{e.preventDefault();setStep(step+1);}}>
      <h2 aria-live="polite">{step+1} of 4 · {label}</h2>
      {step===0 && <label className="block">Trading name<input required maxLength={120} className={field} value={maker} onChange={e=>setMaker(e.target.value)} /></label>}
      {step===1 && <>
        {image && <img src={image} alt={piece} className="max-h-40 object-contain"/>}{feedback && <p role="status">{feedback}</p>}
        <label className="block">Piece name<input required maxLength={120} className={field} value={piece} onChange={e=>setPiece(e.target.value)}/></label>
        <label className="block">Materials, stones and measurements<textarea required className={field} value={details} onChange={e=>setDetails(e.target.value)}/></label>
        <label className="block">Product photo<input className={field} type="file" accept="image/jpeg,image/png,image/webp" required={!image} onChange={e=>{const f=e.target.files?.[0];if(f)setImage(URL.createObjectURL(f));}}/></label>
        <label className="block">Dealer or manufacturer<input required className={field} value={supplier} onChange={e=>setSupplier(e.target.value)}/></label>
        <label className="block">Confirmed supplier quote (BWP)<input required type="number" min=".01" max="999999999" step=".01" className={field} value={quote} onChange={e=>setQuote(e.target.value)}/></label>
      </>}
      {step>=2 && <article className="space-y-2"><img src={image} alt={piece} className="max-h-56 rounded-lg object-contain"/><h3>{piece}</h3><p>{maker}</p><p className="whitespace-pre-wrap">{details}</p></article>}
      {step===2 && <><p>Private supplier quote · {supplier} · BWP {quote}</p><label className="block">Staff markup (%)<input required type="number" min="0" max="10000" step=".01" className={field} value={markup} onChange={e=>setMarkup(e.target.value)}/></label>
        <button type="button" className="underline" onClick={()=>{setFeedback('Staff requested a revision. Update the details and resubmit.');setStep(1);}}>Request a revision</button></>}
      {step>=2 && markup!=='' && <p>Store price · {retail}</p>}
      <div className="flex flex-wrap gap-4">{step>0 && <button type="button" className="underline" onClick={()=>setStep(step-1)}>Back</button>}
        {step<3 && <button className="rounded-full border px-4 py-2">{['Open sample studio','Send for sample review','Approve storefront preview'][step]}</button>}</div>
    </form></details>;
}
