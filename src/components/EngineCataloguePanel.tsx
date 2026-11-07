"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import EngineJewelryViewer from './EngineJewelryViewer';
import type { PublicStoneRecord } from '../lib/stone-verification';

/** A published catalogue stone with its dealer photo and, once the Owner approves it, its 3D. */
type CatalogueStone = PublicStoneRecord & { photo: string; model: string; poster: string; modelNote: string };

function matches(stone: CatalogueStone, term: string, species: string) {
  return (!species || stone.species === species) && (!term || `${stone.ref} ${stone.title} ${stone.species}`.toLocaleLowerCase().includes(term));
}

export default function EngineCataloguePanel() {
  const [pieces, setPieces] = useState<CatalogueStone[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [query, setQuery] = useState(''), [species, setSpecies] = useState(''), [attempt, setAttempt] = useState(0);
  const [viewing, setViewing] = useState<CatalogueStone | null>(null), [buying, setBuying] = useState<CatalogueStone | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    fetch('/api/rough-stones', { cache: 'no-store', signal: abort.signal }).then(async response => {
      if (!response.ok) throw new Error('Catalogue unavailable');
      const body = await response.json();
      if (!Array.isArray(body.items)) throw new Error('Invalid catalogue');
      if (!abort.signal.aborted) { setPieces(body.items); setState('ready'); }
    }).catch(() => { if (!abort.signal.aborted) setState('error'); });
    return () => abort.abort();
  }, [attempt]);
  const term = query.trim().toLocaleLowerCase();
  const rough = pieces.filter(p => p.form === 'rough' && matches(p, term, species)), polished = pieces.filter(p => p.form === 'polished' && matches(p, term, species));
  const speciesOptions = [...new Set(pieces.map(piece => piece.species))].sort((a, b) => a.localeCompare(b));
  const field = 'mt-2 min-h-11 w-full rounded-xl border border-white/20 bg-[#061d19]/70 px-4 py-3 text-base text-[#eef5f2]';
  const grid = (list: CatalogueStone[]) => <div className="grid grid-cols-1 gap-5 min-[480px]:grid-cols-2 lg:grid-cols-3">{list.map(piece => <StoneCard key={piece.stoneId} piece={piece} onView={() => setViewing(piece)} onBuy={() => setBuying(piece)} />)}</div>;
  return <div data-catalogue-panel className="h-full overflow-y-auto overscroll-contain text-[#eef5f2]">
    <div className="mx-auto max-w-6xl px-6 pb-16 pt-24 sm:px-12 sm:pt-28">
      <header className="border-b border-white/15 pb-9 sm:pb-12">
        <p className="text-[10px] uppercase tracking-[0.24em] text-[#b8d0c8]">HOUSEofAMES · Catalogue</p>
        <h1 className="mt-5 text-[40px] font-normal leading-[1.08] tracking-[-0.04em] sm:text-6xl">The Catalogue Room</h1>
        <p className="mt-5 max-w-lg text-sm leading-6 text-[#b8d0c8]">Discover stones from our dealers, from rough diamonds and emeralds to tourmaline, quartz and more. Turn each reviewed stone in 3D, and ask to buy the ones you love.</p>
      </header>
      <section aria-label="Stones" className="pt-8 sm:pt-10">
        {state === 'loading' && <p role="status" className="py-12 text-sm text-[#b8d0c8]">Loading the catalogue…</p>}
        {state === 'error' && <div role="status" className="py-12 text-sm text-[#b8d0c8]"><p>The catalogue is unavailable. Please try again.</p><button type="button" onClick={() => { setState('loading'); setAttempt(value => value + 1); }} className="mt-4 min-h-11 rounded-full border border-white/25 px-5">Try again</button></div>}
        {state === 'ready' && pieces.length === 0 && <p role="status" className="py-12 text-sm leading-6 text-[#b8d0c8]">No reviewed stones are listed yet. New stones will appear here after review.</p>}
        {state === 'ready' && pieces.length > 0 && <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2">
            <label className="text-xs text-[#b8d0c8]">Search by name or reference<input type="search" value={query} onChange={event => setQuery(event.target.value)} className={field} /></label>
            <label className="text-xs text-[#b8d0c8]">Gemstone type<select value={species} onChange={event => setSpecies(event.target.value)} className={field}><option value="">All gemstones</option>{speciesOptions.map(name => <option key={name} value={name}>{name}</option>)}</select></label>
          </div>
          {!rough.length && !polished.length && <div className="py-8 text-sm text-[#b8d0c8]">No stones match your search.<button type="button" className="ml-3 min-h-11 underline" onClick={() => { setQuery(''); setSpecies(''); }}>Clear filters</button></div>}
          {rough.length > 0 && <section aria-labelledby="rough-catalogue-title" className="mb-12"><h2 id="rough-catalogue-title" className="mb-5 text-xl font-normal tracking-tight">Rough gemstones <span className="text-xs text-[#b8d0c8]">{rough.length}</span></h2>{grid(rough)}</section>}
          {polished.length > 0 && <section aria-labelledby="polished-catalogue-title"><h2 id="polished-catalogue-title" className="mb-5 text-xl font-normal tracking-tight">Polished stones <span className="text-xs text-[#b8d0c8]">{polished.length}</span></h2>{grid(polished)}</section>}
        </>}
      </section>
    </div>
    {viewing && <div role="dialog" aria-modal="true" aria-label={`${viewing.title} in 3D`} className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setViewing(null)}>
      <div className="w-full max-w-xl space-y-3 rounded-3xl border border-white/15 bg-[#04201b] p-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] uppercase tracking-[0.16em] text-[#b8d0c8]">{viewing.ref} · {viewing.species}</p><h3 className="text-lg">{viewing.title}</h3></div><button type="button" className="min-h-11 px-2 text-sm underline" onClick={() => setViewing(null)}>Close</button></div>
        <EngineJewelryViewer key={viewing.model} src={viewing.model} poster={viewing.poster} alt={viewing.title} autoLoad opticsProfile="mounted-gem-studio" cameraPreset="gemstone" turntableEnabled={false} style={{ height: 380 }} />
        <p className="text-xs text-[#b8d0c8]">Drag to turn the stone. {viewing.modelNote}</p>
        <button type="button" className="ames-pill min-h-11 rounded-full border border-white/25 px-5 text-sm" onClick={() => { setBuying(viewing); setViewing(null); }}>Request to buy</button>
      </div>
    </div>}
    {buying && <BuyDialog piece={buying} onClose={() => setBuying(null)} />}
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
      <p className="text-[10px] uppercase tracking-[0.16em] text-[#b8d0c8]">{piece.ref} · {piece.species}</p>
      <h3 className="mt-2 text-lg font-normal leading-snug">{piece.title}</h3>
      <p className="mt-3 text-sm">{piece.form === 'rough' ? 'Rough' : 'Polished'} · {piece.carats} ct</p>
      <p className="mt-2 text-xs text-[#b8d0c8]">Material origin: {piece.origin.replaceAll('-', ' ')}<br />{piece.measurements}</p>
      <p className="mt-2 text-xs">Treatments: {piece.treatments === 'none-reported' ? 'None reported' : piece.treatmentDetails}</p>
      {piece.gradeSummary && <p className="mt-2 text-xs">{piece.gradeSummary}</p>}
      {piece.reportStatus === 'verified' ? <a className="mt-4 inline-block border-b border-white/50 text-xs" href={piece.reportUrl} target="_blank" rel="noreferrer">{piece.laboratory} · {piece.reportNumber}</a> : <p className="mt-4 text-xs text-[#b8d0c8]">No laboratory report issued</p>}
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
  const field = 'mt-1 w-full rounded-xl border border-white/20 bg-[#061d19] px-3 py-2.5 text-base text-[#eef5f2]';
  return <div role="dialog" aria-modal="true" aria-label={`Request to buy ${piece.ref}`} className="fixed inset-0 z-[85] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
    <div className="w-full max-w-md space-y-4 rounded-3xl border border-white/15 bg-[#04201b] p-5 text-sm" onClick={e => e.stopPropagation()}>
      <div><p className="text-[10px] uppercase tracking-[0.16em] text-[#b8d0c8]">{piece.ref} · {piece.carats} ct</p><h3 className="text-lg">Request to buy {piece.title}</h3></div>
      {state === 'sent' ? <><p role="status" className="text-emerald-200">Your request has been sent. HOUSEofAMES will contact you to agree the price and complete the buyer checks.</p><button type="button" className="ames-pill min-h-11 rounded-full border border-white/25 px-5" onClick={onClose}>Close</button></>
        : state === 'signin' ? <><p>Sign in to your HOUSEofAMES account (with a verified email) to ask to buy this stone.</p><div className="flex gap-3"><Link href="/app/account" className="ames-pill inline-flex min-h-11 items-center rounded-full border border-white/25 px-5">Sign in</Link><button type="button" className="min-h-11 underline" onClick={onClose}>Not now</button></div></>
        : <form onSubmit={send} className="space-y-3">
          <p className="text-xs text-[#b8d0c8]">HOUSEofAMES confirms the price with you directly. As a licensed dealer we complete buyer identity (KYC) checks before any sale.</p>
          <label className="block text-xs">WhatsApp or phone (optional)<input value={phone} onChange={e => setPhone(e.target.value)} maxLength={40} inputMode="tel" className={field} /></label>
          <label className="block text-xs">Message (optional)<textarea value={message} onChange={e => setMessage(e.target.value)} maxLength={1000} rows={3} className={field} placeholder="Questions, or how you would like to view the stone" /></label>
          {error && <p role="alert" className="text-xs text-red-200">{error}</p>}
          <div className="flex gap-3"><button disabled={state === 'sending'} className="ames-pill min-h-11 rounded-full border border-white/25 px-5 disabled:opacity-40">{state === 'sending' ? 'Sending…' : 'Send request'}</button><button type="button" className="min-h-11 underline" onClick={onClose}>Cancel</button></div>
        </form>}
    </div>
  </div>;
}
