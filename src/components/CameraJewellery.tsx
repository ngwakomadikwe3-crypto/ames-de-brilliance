'use client';
import {useEffect,useRef,useState} from 'react';
import TrackedRing from './TrackedRing';
import EngineJewelryViewer from './EngineJewelryViewer';
import {studioCameraPreset} from '../lib/customer-jewelry-display';
type Point={x:number;y:number};
type Mode='size'|'wear';
export default function CameraJewellery({mode,category,model,onClose}:{mode:Mode;category:string;model:string;onClose:()=>void}){
  const video=useRef<HTMLVideoElement>(null), dialog=useRef<HTMLDialogElement>(null);
  const [frame,setFrame]=useState(''),[ready,setReady]=useState(false),[error,setError]=useState('');
  const [aspect,setAspect]=useState(4/3),[points,setPoints]=useState<Point[]>([]),[centre,setCentre]=useState<Point>({x:.5,y:.5});
  const [size,setSize]=useState(45),[angle,setAngle]=useState(0);
  const ring=category==='ring', measuring=mode==='size';
  useEffect(()=>{const d=dialog.current;d?.showModal();return ()=>d?.close();},[]);
  useEffect(()=>{
    if(frame)return;
    let disposed=false,stream:MediaStream|undefined;
    setReady(false);setError('');
    async function connect(){
      try{
        stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1280}}});
        if(disposed){stream.getTracks().forEach(t=>t.stop());return;}
        if(video.current){video.current.srcObject=stream;await video.current.play();}
      }catch{if(!disposed)setError('Camera unavailable. Check browser camera permission or use the manual sizing guide.');}
    }
    void connect();return ()=>{disposed=true;stream?.getTracks().forEach(t=>t.stop());};
  },[frame]);
  function freeze(){
    const v=video.current;if(!v?.videoWidth)return;
    const c=document.createElement('canvas');c.width=v.videoWidth;c.height=v.videoHeight;
    const ctx=c.getContext('2d');if(!ctx)return;ctx.drawImage(v,0,0);setPoints([]);setFrame(c.toDataURL('image/jpeg',.9));
  }
  function point(e:React.PointerEvent<HTMLDivElement>){
    const r=e.currentTarget.getBoundingClientRect();
    const p={x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))};
    if(!measuring)setCentre(p);else if(frame && e.type==='pointerdown')setPoints(a=>a.length<4?[...a,p]:a);
  }
  const distance=(a:Point,b:Point)=>Math.hypot((a.x-b.x)*aspect,a.y-b.y);
  const reference=points.length>=2?distance(points[0],points[1]):0;
  const mm=points.length===4 && reference>.02?20*distance(points[2],points[3])/reference:0;
  const plausible=ring?mm>=8 && mm<=35:mm>=60 && mm<=400;
  return <dialog ref={dialog} onCancel={onClose} className="m-auto max-h-[95dvh] w-[min(94vw,620px)] overflow-y-auto rounded-2xl bg-[#08251f] p-4 text-white backdrop:bg-black/70">
    <div className="flex items-center justify-between"><h2>{ring?'Try on & measure':measuring?'Camera sizer':'Virtual try-on'}</h2><button onClick={onClose} className="min-h-11 px-3">Close</button></div>
    {ring && <a className="block underline" href="/ring-scale.svg" target="_blank" rel="noreferrer">Open printable 20 mm scale</a>}
    <p className="mb-2 text-sm">{ring?'Show the back of your hand to try on the ring. To measure as well, place the printed square beside your finger at the same height.' : measuring?(frame?(points.length<2?'Tap the 0 and 20 mm ruler marks.':ring?'Tap opposite inside edges of the ring through its centre.':'Tap the start and end marks on the flattened strip.'):(ring?'Lay a well-fitting ring beside a ruler.':'Wrap a paper strip around your wrist, mark where it meets, then lay it flat beside a ruler.')+' Hold the camera directly above both and include the 0 and 20 mm marks.'):'Point the camera at your hand. Drag the piece into place, then adjust its size and angle.'}</p>
    <div className="relative mx-auto overflow-hidden rounded-xl bg-black" style={{aspectRatio:aspect,maxWidth:`min(100%, ${aspect*50}dvh)`,touchAction:'none'}} onPointerDown={e=>{if(ring)return;e.currentTarget.setPointerCapture(e.pointerId);point(e);}} onPointerMove={e=>{if(!measuring && e.currentTarget.hasPointerCapture(e.pointerId))point(e);}}>
      {frame?<img src={frame} alt="Measurement frame" className="block h-full w-full"/>:<video ref={video} playsInline muted autoPlay className="block h-full w-full" onLoadedData={()=>{const v=video.current;if(v?.videoHeight){setAspect(v.videoWidth/v.videoHeight);setReady(true);}}}/>}
      {ring && ready && <TrackedRing video={video} model={model}/>}
      {!ring && !measuring && ready && <div className="pointer-events-none absolute" style={{left:centre.x*100+'%',top:centre.y*100+'%',width:size+'%',aspectRatio:'1',transform:`translate(-50%,-50%) rotate(${angle}deg)`}}><EngineJewelryViewer src={model} alt="Selected piece" autoLoad opticsProfile="mounted-gem-studio" cameraPreset={studioCameraPreset(category)} turntableEnabled={false} style={{width:'100%',height:'100%'}}/></div>}
      {points.map((p,i)=><span key={i} className="pointer-events-none absolute h-3 w-3 rounded-full border-2 border-black" style={{left:p.x*100+'%',top:p.y*100+'%',background:i<2?'white':'#ffce65',transform:'translate(-50%,-50%)'}}/>)}
    </div>
    {error && <p role="alert">{error}</p>}
    {!ring && (!frame?<button disabled={!ready} className="min-h-11 underline" onClick={freeze}>Freeze frame</button>:<div className="flex gap-5"><button className="min-h-11 underline" onClick={()=>setPoints(p=>p.slice(0,-1))}>Undo point</button><button onClick={()=>{setFrame('');setPoints([]);}}>Retake</button></div>)}
    {points.length===4 && <p role="status">{plausible?(ring?`Estimated inside diameter ${mm.toFixed(1)} mm · circumference ${(mm*Math.PI).toFixed(1)} mm.`:`Estimated wrist circumference ${(mm/10).toFixed(1)} cm.`):'Check the reference marks and retake the measurement.'}</p>}
    {!ring && !measuring && <div className="grid gap-2 py-2"><label className="flex items-center gap-3">Size<input className="flex-1" type="range" min={15} max={110} value={size} onChange={e=>setSize(Number(e.target.value))}/></label><label className="flex items-center gap-3">Angle<input className="flex-1" type="range" min={-180} max={180} value={angle} onChange={e=>setAngle(Number(e.target.value))}/></label></div>}
  </dialog>;
}
