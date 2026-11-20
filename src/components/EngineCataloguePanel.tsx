"use client";
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { studioCameraPreset } from '../lib/customer-jewelry-display';
import {HouseChoices,diamondCuts} from './HouseChoices';
import {useAtelierLanguage} from './AtelierLanguage';
import SizeGuide from './SizeGuide';
import {WatchStrap} from './WatchStrap';
import ConfigurationPrice from './ConfigurationPrice';
import SampleQuote from './SampleQuote';
import ModelViewer from './ModelViewer';
import WatchMovement from './WatchMovement';
import EngineJewelryViewer from './EngineJewelryViewer';
import type { PublicStoneRecord } from '../lib/stone-verification';
import illustratedPosters from '../lib/loose-gemstone-posters.json';
import registry from '../lib/house-gemstones.json';
import { houseScript } from '../lib/script-font';
import { GEMSTONE_FACTS, mohsLabel } from '../lib/gemstone-facts';

/** The AMES gemstone gallery: the house's own 3D stones (the same ones SAME shows in chat), diamonds aside. */
type GalleryStone = { id: string; name: string; form: string; cut: string; category: string; defaultColors: string[]; aliases: string[] };
// Bumped whenever the gallery stones are rebuilt: phones keep /ames-engine files for days, so a new version
// must have a new address to be fetched at once.
const GALLERY_VERSION = '10';
const looseLibraryEntries: GalleryStone[] = [
  { id: 'stone-malachite', name: "Malachite", defaultColors: ["banded green"], aliases: [], category: 'loose gem', form: 'loose', cut: '' },
  { id: 'stone-onyx', name: "Onyx", defaultColors: ["black"], aliases: [], category: 'loose gem', form: 'loose', cut: '' },
  { id: 'stone-tigers-eye', name: "Tiger’s eye", defaultColors: ["golden brown"], aliases: ["tiger\u0027s eye", "tiger eye"], category: 'loose gem', form: 'loose', cut: '' },
  { id: 'stone-labradorite', name: "Labradorite", defaultColors: ["grey with flashes of colour"], aliases: [], category: 'loose gem', form: 'loose', cut: '' },
  { id: 'stone-chrysoprase', name: "Chrysoprase", defaultColors: ["apple green"], aliases: [], category: 'loose gem', form: 'loose', cut: '' },
  { id: 'stone-carnelian', name: "Carnelian", defaultColors: ["orange red"], aliases: [], category: 'loose gem', form: 'loose', cut: '' },
  { id: 'stone-rhodochrosite', name: "Rhodochrosite", defaultColors: ["pink"], aliases: [], category: 'loose gem', form: 'loose', cut: '' },
  { id: 'stone-larimar', name: "Larimar", defaultColors: ["pale blue"], aliases: [], category: 'loose gem', form: 'loose', cut: '' },
  { id: 'stone-rubellite-tourmaline', name: "Rubellite tourmaline", defaultColors: ["pink to red"], aliases: [], category: 'loose gem', form: 'loose', cut: '' },
  { id: 'stone-padparadscha-sapphire', name: "Padparadscha sapphire", defaultColors: ["pink and orange"], aliases: [], category: 'loose gem', form: 'loose', cut: '' },
  { id: 'stone-black-opal', name: "Black opal", defaultColors: ["dark body colour"], aliases: [], category: 'loose gem', form: 'loose', cut: '' },
  { id: 'stone-pearl', name: "Pearl", defaultColors: ["white to cream"], aliases: [], category: 'loose gem', form: 'loose', cut: '' },
];
const existingLooseIds = new Set(['stone-paraiba-tourmaline', 'stone-tsavorite-garnet', 'stone-demantoid-garnet']);
const loosePosters: Record<string, string> = illustratedPosters;
const libraryOnlyIds = new Set(looseLibraryEntries.map(stone => stone.id));
const looseOnly = (stone: GalleryStone) => existingLooseIds.has(stone.id) || libraryOnlyIds.has(stone.id);
const GALLERY = [...registry, ...looseLibraryEntries].sort((a, b) => a.name.localeCompare(b.name));
const galleryText = (stone: GalleryStone) => `${stone.name} ${stone.aliases.join(' ')} ${stone.category} ${stone.defaultColors.join(' ')}`.toLocaleLowerCase();

/** A published catalogue stone with its dealer photo and, once the Owner approves it, its 3D. */
type CatalogueStone = PublicStoneRecord & { photo: string; model: string; poster: string; modelNote: string };

function matches(stone: CatalogueStone, term: string, species: string) {
  return (!species || stone.species === species) && (!term || `${stone.ref} ${stone.title} ${stone.species}`.toLocaleLowerCase().includes(term));
}

export default function EngineCataloguePanel({onAskSame}:{onAskSame:(id:string,question:string)=>void}) {
  const {t}=useAtelierLanguage();
  const [pieces, setPieces] = useState<CatalogueStone[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [query, setQuery] = useState(''), [species, setSpecies] = useState('');
  const [viewing, setViewing] = useState<CatalogueStone | null>(null), [buying, setBuying] = useState<CatalogueStone | null>(null), [gem, setGem] = useState<GalleryStone | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    fetch('/api/rough-stones', { cache: 'no-store', signal: abort.signal }).then(async response => {
      if (!response.ok) throw new Error('Catalogue unavailable');
      const body = await response.json();
      if (!Array.isArray(body.items)) throw new Error('Invalid catalogue');
      if (!abort.signal.aborted) { setPieces(body.items.filter((item: CatalogueStone) => item.form === 'polished' && GALLERY.some(g => [item.species,item.title].some(value => String(value).toLowerCase().includes(g.name.toLowerCase()))))); setState('ready'); }
    }).catch(() => { if (!abort.signal.aborted) setState('error'); });
    return () => abort.abort();
  }, []);
  // Opening a stone adds a history step, so the phone's back gesture returns to the gallery rather than leaving it.
  const openGem = (stone: GalleryStone) => { try { history.pushState({ amesGem: stone.id }, ''); } catch {} setGem(stone); };
  const closeGem = () => { if (history.state?.amesGem) history.back(); else setGem(null); };
  useEffect(() => {
    const onPop = () => setGem(null);
    window.addEventListener('popstate', onPop); return () => window.removeEventListener('popstate', onPop);
  }, []);
  const term = query.trim().toLocaleLowerCase();
  const polished = pieces.filter(p => p.form === 'polished' && matches(p, term, species));
  const speciesOptions = [...new Set(pieces.map(piece => piece.species))].sort((a, b) => a.localeCompare(b));
  const gallery = GALLERY.filter(stone => (!term || galleryText(stone).includes(term)) && (!species || galleryText(stone).includes(species.toLocaleLowerCase())));
  const field = 'mt-2 min-h-11 w-full rounded-xl border border-white/20 bg-[#061d19]/70 px-4 py-3 text-base text-white';
  const grid = (list: CatalogueStone[]) => <div className="grid grid-cols-1 gap-5 min-[480px]:grid-cols-2 lg:grid-cols-3">{list.map(piece => <StoneCard key={piece.stoneId} piece={piece} onView={() => setViewing(piece)} onBuy={() => setBuying(piece)} />)}</div>;
  // A gallery stone opens like a Boutique piece: the stone large in 3D with a back arrow on it, its details below.
  if (gem && looseOnly(gem)) return <section className="h-full overflow-y-auto px-6 pt-16 text-white">
    <button type="button" className="min-h-11 underline" onClick={closeGem}>Back to Gemstones</button>
    <h2 className="mt-5 text-3xl">{gem.name}</h2>
    <p className="mt-2">Loose gemstone only. No jewellery available.</p>
    <p className="mt-2 text-sm">{gem.defaultColors.join(', ')}</p>
    {loosePosters[gem.id] && <figure className="mt-6"><img src={loosePosters[gem.id]} alt={gem.name} width={384} height={256} className="mx-auto w-full max-w-md" /><figcaption className="text-center text-xs">Illustrated gemstone preview</figcaption></figure>}
    {existingLooseIds.has(gem.id) && <EngineJewelryViewer key={gem.id} src={`/ames-engine/${gem.id}/web/jewelry.glb?v=${GALLERY_VERSION}`} poster={`/ames-engine/${gem.id}/web/poster.webp?v=${GALLERY_VERSION}`} alt={gem.name} autoLoad opticsProfile="gemstone-studio" cameraPreset="gemstone" turntableEnabled style={{ height: 380 }} />}
  </section>;
  if (gem) return <GemDetail onAskSame={onAskSame} key={gem.id} stone={gem} list={gallery.length ? gallery : GALLERY} onGo={setGem} onClose={closeGem} />;
  return <div data-catalogue-panel className="h-full overflow-y-auto overscroll-contain text-white">
    <div className="mx-auto max-w-6xl px-6 pb-16 pt-16 sm:px-12 sm:pt-20">
      <header className="flex items-center justify-between pb-1"><h1 className={`${houseScript.className} text-[52px] font-normal leading-[1.1] tracking-normal sm:text-7xl`} style={{ fontFamily: houseScript.style.fontFamily, padding: "0.32em 0.18em 0.05em", lineHeight: 1.25 }}>{t('Gemstones')}</h1></header>
      <input type="search" aria-label="Search gemstones by name or reference" placeholder={t('Search gemstones')} value={query} onChange={event => setQuery(event.target.value)} className={field} />
      {state==='ready' && pieces.length>0 && <section aria-label="Available polished stones">
        {state === 'ready' && pieces.length > 0 && <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2">
            <label className="text-xs text-white">Gemstone type<select value={species} onChange={event => setSpecies(event.target.value)} className={field}><option value="">All gemstones</option>{speciesOptions.map(name => <option key={name} value={name}>{name}</option>)}</select></label>
          </div>
          {!polished.length && <div className="py-8 text-sm text-white">No stones match your search.<button type="button" className="ml-3 min-h-11 underline" onClick={() => { setQuery(''); setSpecies(''); }}>Clear filters</button></div>}
          {polished.length > 0 && <section aria-labelledby="polished-catalogue-title"><h2 id="polished-catalogue-title" className="mb-5 text-xl font-normal"><span className={`${houseScript.className} text-[34px] leading-none`}>Polished stones</span> <span className="text-xs text-white">{polished.length}</span></h2>{grid(polished)}</section>}
        </>}
      </section>}
      <section aria-label="Gemstone gallery" className="pt-4" data-gemstone-gallery>
        {gallery.length === 0 ? <p className="py-6 text-sm text-white">No gallery stones match your search.</p> :
        <GemShowcase stones={gallery} onOpen={openGem}/>}
      </section>
    </div>
    {viewing && <div role="dialog" aria-modal="true" aria-label={`${viewing.title} in 3D`} className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setViewing(null)}>
      <div className="w-full max-w-xl space-y-3 rounded-3xl border border-white/15 bg-[#04201b] p-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] uppercase tracking-[0.16em] text-white">{viewing.ref} · {viewing.species}</p><h3 className="text-lg">{viewing.title}</h3></div><button type="button" className="min-h-11 px-2 text-sm underline" onClick={() => setViewing(null)}>Close</button></div>
        <EngineJewelryViewer key={viewing.model} src={viewing.model} poster={viewing.poster} alt={viewing.title} autoLoad opticsProfile="mounted-gem-studio" cameraPreset="gemstone" turntableEnabled style={{ height: 380 }} />
        <p className="text-xs text-white">Drag to turn the stone. {viewing.modelNote}</p>
        <button type="button" className="ames-pill min-h-11 rounded-full border border-white/25 px-5 text-sm" onClick={() => { setBuying(viewing); setViewing(null); }}>Request to buy</button>
      </div>
    </div>}
    {buying && <BuyDialog piece={buying} onClose={() => setBuying(null)} />}
  </div>;
}

function GemShowcase({stones,onOpen}:{stones:GalleryStone[];onOpen:(stone:GalleryStone)=>void}){
  const {t}=useAtelierLanguage();
  return <div className="grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-4 lg:grid-cols-6" aria-label="Choose a gemstone">
    {stones.map(stone=><button key={stone.id} type="button" className="ames-stone-option" onClick={()=>onOpen(stone)}>
      <img src={loosePosters[stone.id] ?? `/ames-engine/${stone.id}/web/poster.webp?v=${GALLERY_VERSION}`} alt="" width={120} height={86} loading="lazy"/>
      <span>{t(stone.name)}</span>
      {looseOnly(stone) && <small>Loose gemstone only</small>}
    </button>)}
  </div>;
}

function StoneCard({ piece, onView, onBuy }: { piece: CatalogueStone; onView: () => void; onBuy: () => void }) {
  const image = piece.poster || piece.photo;
  return <article data-catalogue-stone={piece.stoneId} className="min-w-0 break-words overflow-hidden rounded-2xl border border-white/15 bg-emerald-950/20">
    {image ? <button type="button" onClick={piece.model ? onView : undefined} className="block aspect-square w-full bg-[#03120f]" aria-label={piece.model ? `View ${piece.title} in 3D` : piece.title} disabled={!piece.model}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image} alt={piece.title} loading="lazy" className={`h-full w-full ${piece.poster ? 'object-contain p-6' : 'object-cover'}`} />
    </button> : null}
    <div className="p-5">
      <p className="text-[10px] uppercase tracking-[0.16em] text-white">{piece.ref} · {piece.species}</p>
      <h3 className="mt-2 text-lg font-normal leading-snug">{piece.title}</h3>
      <p className="mt-3 text-sm">{piece.form === 'rough' ? 'Rough' : 'Polished'} · {piece.carats} ct</p>
      <p className="mt-2 text-xs text-white">Material origin: {piece.origin.replaceAll('-', ' ')}<br />{piece.measurements}</p>
      <p className="mt-2 text-xs">Treatments: {piece.treatments === 'none-reported' ? 'None reported' : piece.treatmentDetails}</p>
      {piece.gradeSummary && <p className="mt-2 text-xs">{piece.gradeSummary}</p>}
      {piece.reportStatus === 'verified' ? <a className="mt-4 inline-block border-b border-white/50 text-xs" href={piece.reportUrl} target="_blank" rel="noreferrer">{piece.laboratory} · {piece.reportNumber}</a> : <p className="mt-4 text-xs text-white">No laboratory report issued</p>}
      <div className="mt-5 flex flex-wrap gap-2">
        {piece.model && <button type="button" onClick={onView} className="ames-pill min-h-11 rounded-full border border-white/25 px-4 text-xs">View in 3D</button>}
        <button type="button" onClick={onBuy} className="ames-pill min-h-11 rounded-full border border-white/25 px-4 text-xs">Request to buy</button>
      </div>
    </div>
  </article>;
}

function BuyDialog({ piece, onClose }: { piece: CatalogueStone; onClose: () => void }) {
  const [phone, setPhone] = useState(''), [message, setMessage] = useState(''), [state, setState] = useState<'idle' | 'sending' | 'sent' | 'signin' | 'error'>('idle'), [error, setError] = useState('');
  async function send(event: React.FormEvent) {
    event.preventDefault(); setState('sending'); setError('');
    try {
      const response = await fetch('/api/catalogue-requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stoneId: piece.stoneId, phone, message }) });
      const body = await response.json().catch(() => ({}));
      if (response.status === 401 || response.status === 403) { setState('signin'); setError(body.error || ''); return; }
      if (!response.ok) throw new Error(body.error || 'The request could not be sent.');
      setState('sent');
    } catch (e) { setState('error'); setError(e instanceof Error ? e.message : 'The request could not be sent.'); }
  }
  const field = 'mt-1 w-full rounded-xl border border-white/20 bg-[#061d19] px-3 py-2.5 text-base text-white';
  return <div role="dialog" aria-modal="true" aria-label={`Request to buy ${piece.ref}`} className="fixed inset-0 z-[85] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
    <div className="w-full max-w-md space-y-4 rounded-3xl border border-white/15 bg-[#04201b] p-5 text-sm" onClick={e => e.stopPropagation()}>
      <div><p className="text-[10px] uppercase tracking-[0.16em] text-white">{piece.ref} · {piece.carats} ct</p><h3 className="text-lg">Request to buy {piece.title}</h3><ConfigurationPrice piece={piece.stoneId} setting="loose" options=""/></div>
      {state === 'sent' ? <><p role="status" className="text-emerald-200">Your request has been sent. HOUSEofAMES will contact you to agree the price and complete the buyer checks.</p><button type="button" className="ames-pill min-h-11 rounded-full border border-white/25 px-5" onClick={onClose}>Close</button></>
        : state === 'signin' ? <><p>Sign in to your HOUSEofAMES account (with a verified email) to ask to buy this stone.</p><div className="flex gap-3"><Link href="/app/account" className="ames-pill inline-flex min-h-11 items-center rounded-full border border-white/25 px-5">Sign in</Link><button type="button" className="min-h-11 underline" onClick={onClose}>Not now</button></div></>
        : <form onSubmit={send} className="space-y-3">
          <p className="text-xs text-white">HOUSEofAMES confirms the price with you directly. As a licensed dealer we complete buyer identity (KYC) checks before any sale.</p>
          <label className="block text-xs">WhatsApp or phone (optional)<input value={phone} onChange={e => setPhone(e.target.value)} maxLength={40} inputMode="tel" className={field} /></label>
          <label className="block text-xs">Message (optional)<textarea value={message} onChange={e => setMessage(e.target.value)} maxLength={1000} rows={3} className={field} placeholder="Questions, or how you would like to view the stone" /></label>
          {error && <p role="alert" className="text-xs text-red-200">{error}</p>}
          <div className="flex gap-3"><button disabled={state === 'sending'} className="ames-pill min-h-11 rounded-full border border-white/25 px-5 disabled:opacity-40">{state === 'sending' ? 'Sending…' : 'Send request'}</button><button type="button" className="min-h-11 underline" onClick={onClose}>Cancel</button></div>
        </form>}
    </div>
  </div>;
}

/** About the stone, shown under its 3D view: what it is, its hardness, where it is mined and what it is made into. */
function GemFacts({ id }: { id: string }) {
  // Kept short: what it is, then a compact list (label left, answer right).
  const f = GEMSTONE_FACTS[id];
  const rows: [string, string][] = [['Hardness', `${mohsLabel(f.mohs)} on the Mohs scale (diamond is 10)`], ['Found in', f.foundIn.join(', ')], ['Worn as', f.jewellery], ...(f.care ? [['Care', f.care] as [string, string]] : [])];
  return <section aria-label="About this gemstone" className="text-xs leading-5 text-white" data-gem-facts={id}>
    <p className="text-white">{f.about}</p>
    <dl className="mt-3 grid grid-cols-[4.5rem_1fr] gap-x-3 gap-y-1.5 border-t border-white/10 pt-3">
      {rows.map(([k, v]) => <div key={k} className="contents"><dt className="text-white">{k}</dt><dd>{v}</dd></div>)}
    </dl>
  </section>;
}

function GemDetail({ stone, list, onGo, onClose, onAskSame }: { onAskSame:(id:string,question:string)=>void; stone: GalleryStone; list: GalleryStone[]; onGo: (stone: GalleryStone) => void; onClose: () => void }) {
  const {t}=useAtelierLanguage();
  const facts = GEMSTONE_FACTS[stone.id];
  const [setting, setSetting] = useState('ring');
  const [dropCut,setDropCut]=useState('Pear');
  const [ringCut,setRingCut] = useState('');
  const [cut, setCut] = useState('');
  const [metal,setMetal] = useState('silver');
  const [caseShape,setCaseShape] = useState('Original');
  const [strap,setStrap]=useState('metal'),[leather,setLeather]=useState('cognac');
  const baseModel = `/ames-engine/jewellery-samples/${setting==='ring' && ringCut ? ringCut+'/' : ''}${stone.id}-${setting==='necklace'?'necklace-'+dropCut.toLowerCase():setting==='watch' && caseShape!=='Original'?'watch-'+caseShape.toLowerCase():setting}.gltf${metal==='silver'?'':'?metal='+metal}`;
  const sampleModel=setting==='watch' && strap==='leather'?baseModel+(baseModel.includes('?')?'&':'?')+'leather='+leather:baseModel;
  const configuration=[setting==='loose'?cut||stone.cut:metal,setting==='ring'&&(ringCut||'Original'),setting==='necklace'&&dropCut,setting==='watch'&&caseShape,setting==='watch'&&strap,setting==='watch'&&strap==='leather'&&leather].filter(Boolean).join(' · ');
  const modelCut = cut || (stone.id === 'stone-amethyst' ? 'Emerald' : '');
  const src = modelCut
    ? `/ames-engine/gallery-cuts/${modelCut}/${stone.id}.glb?v=11`
    : `/ames-engine/${stone.id}/web/jewelry.glb?v=${GALLERY_VERSION}`;
  // Previous and next stone without going back to the gallery: arrows on the stage, or a swipe across the details
  // (on the stage itself a drag turns the stone). Wraps round at either end.
  const at = Math.max(0, list.findIndex(s => s.id === stone.id));
  const prev = list[(at - 1 + list.length) % list.length], next = list[(at + 1) % list.length];
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => { top.current?.scrollTo({ top: 0 }); }, [stone.id]);
  const arrow = 'ames-pill absolute top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full';
  return <div ref={top} className="h-full overflow-y-auto overscroll-contain pt-20 text-white" data-gem-detail={stone.id}>
    <div className="ames-jewelry-stage relative mx-auto w-full shrink-0" style={{ maxWidth: 720, height: 'clamp(200px, 34dvh, 335px)' }}>
      <button type="button" onClick={onClose} aria-label="Back to gallery" className="ames-pill absolute left-5 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-full">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M15 18l-6-6 6-6" /></svg>
      </button>
      {list.length > 1 && <>
        <button type="button" onClick={() => onGo(prev)} aria-label={`Previous: ${prev.name}`} className={`${arrow} left-3`}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M15 18l-6-6 6-6" /></svg></button>
        <button type="button" onClick={() => onGo(next)} aria-label={`Next: ${next.name}`} className={`${arrow} right-3`}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M9 6l6 6-6 6" /></svg></button>
      </>}
      {setting !== 'loose' ? <EngineJewelryViewer src={sampleModel} alt={`${stone.name} ${setting}`} autoLoad cameraPreset={studioCameraPreset(setting)} opticsProfile="mounted-gem-studio" turntableEnabled style={{width:'100%',height:'100%'}} /> : stone.id === 'stone-amber' ? <ModelViewer key={src} src={cut ? src : "/ames-engine/stone-amber/web/interactive.glb?v=1"} alt={stone.name}
        poster={cut ? undefined : `/ames-engine/${stone.id}/web/poster.webp?v=${GALLERY_VERSION}`}
        autoRotate cameraControls ar={false} jewelryPresentation cameraOrbit="25deg 49deg auto"
        style={{ width: '100%', height: '100%' }} /> :
      <EngineJewelryViewer key={src} src={src} poster={cut ? undefined : `/ames-engine/${stone.id}/web/poster.webp?v=${GALLERY_VERSION}`} alt={stone.name} autoLoad opticsProfile="gemstone-studio" cameraPreset="gemstone" turntableEnabled style={{ width: '100%', height: '100%' }} />}
    </div>
    <div className="mx-auto w-full px-6 pb-8 pt-2" style={{ maxWidth: 620 }}
      onTouchStart={e => { const t = e.touches[0]; swipe.current = { x: t.clientX, y: t.clientY }; }}
      onTouchEnd={e => { const s0 = swipe.current, t = e.changedTouches[0]; swipe.current = null; if (!s0 || list.length < 2) return;
        const dx = t.clientX - s0.x, dy = t.clientY - s0.y; if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) onGo(dx < 0 ? next : prev); }}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 style={{ fontFamily:'var(--font-satoshi)', fontSize: 27, color: '#ffffff', lineHeight: 1.1 }}>{t(stone.name)}</h2>
      </div>
      {<button type="button" aria-label={'Ask SAME about '+stone.name} className="ames-pill my-2 min-h-11 rounded-full px-4 text-sm" onClick={()=>{
        const detail = setting==='watch'?caseShape+' case':setting==='necklace'?dropCut+' drop cut':setting==='ring'&&ringCut?ringCut+' cut':'';
        onAskSame(stone.id, setting==='loose' ? 'Tell me about '+stone.name+' as a loose gemstone with the '+(cut||stone.cut)+' cut.' : 'Tell me about this '+stone.name+' '+setting+' in '+metal.replace('-', ' ')+(detail?', '+detail:'')+'.');
      }}>Ask SAME</button>}
      {setting==='watch' && <WatchMovement/>}
      <HouseChoices label="View in 3D" value={setting} onChange={setSetting} choices={{ring:'Ring',bracelet:'Bracelet',earrings:'Earrings',necklace:'Necklace',watch:'Watch',loose:'Loose gemstone'}}/>
      {setting !== 'loose' && <HouseChoices label="Metal" value={metal} choices={{silver:'Silver',gold:'Gold','rose-gold':'Rose gold'}} onChange={setMetal}/>}
      {setting === 'necklace' && <HouseChoices label="Drop cut" value={dropCut} onChange={setDropCut} choices={{Pear:'Pear',Round:'Round',Oval:'Oval',Cushion:'Cushion'}}/>}
      {setting === 'watch' && <WatchStrap strap={strap} setStrap={setStrap} colour={leather} setColour={setLeather}/>}
      {setting === 'watch' && <HouseChoices label="Case shape" value={caseShape} onChange={setCaseShape} choices={{Original:'Classic rectangle',Square:'Square',Slim:'Slim rectangle',Round:'Round'}}/>}
      {setting === 'ring' && <HouseChoices label="Centre cut" value={ringCut} onChange={setRingCut} choices={{'':'Original',...Object.fromEntries(diamondCuts.map(c=>[c,c]))}}/>}
      {['ring','bracelet','watch'].includes(setting) && <SizeGuide category={setting} model={sampleModel} key={setting} wrist={setting!=='ring'}/>}
      {setting !== 'loose' && <p className="my-2 text-xs">HOUSEofAMES design, made to order by our manufacturing partners.</p>}
      <ConfigurationPrice key={stone.id+setting+configuration} piece={stone.id} setting={setting} options={configuration}/>
      {setting !== 'loose' && <SampleQuote configuration={configuration} key={stone.id+setting+configuration} stone={stone.name} caseShape={setting==='watch'?caseShape+(strap==='leather'?' · '+leather+' leather strap':' · metal bracelet'):undefined} metal={metal} setting={setting} cut={setting === "ring" ? ringCut : setting === "necklace" ? dropCut : ""} />}
      {setting === 'loose' && <HouseChoices label="Cut" value={cut} onChange={setCut} choices={{'':'Original · '+stone.cut,...Object.fromEntries(diamondCuts.filter(c=>c.toLowerCase()!==stone.cut.toLowerCase()).map(c=>[c,c]))}}/>}
      {facts && <details className="mt-3 text-sm"><summary className="cursor-pointer py-3">About this stone</summary><GemFacts id={stone.id} /></details>}
    </div>
  </div>;
}
