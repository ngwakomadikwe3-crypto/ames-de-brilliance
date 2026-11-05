"use client";
import { useEffect, useState } from 'react';
import type { PublicStoneRecord } from '../lib/stone-verification';
import { roughStonesOnly, searchRoughStones } from '../lib/rough-stone-catalogue';

export default function EngineCataloguePanel() {
  const [copyStatus, setCopyStatus] = useState('');
  async function copyReference(stone: PublicStoneRecord) {
    try { await navigator.clipboard.writeText(`${stone.ref}: ${stone.title} — ${stone.species}, rough, ${stone.carats} ct`); setCopyStatus(`Copied reference ${stone.ref}.`); }
    catch { setCopyStatus(`Copy unavailable. Stone reference: ${stone.ref}`); }
  }
  const [pieces, setPieces] = useState<PublicStoneRecord[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [query, setQuery] = useState(''), [species, setSpecies] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    fetch('/api/rough-stones', { cache: 'no-store', signal: abort.signal }).then(async response => {
      if (!response.ok) throw new Error('Catalogue unavailable');
      const body = await response.json();
      if (!Array.isArray(body.items)) throw new Error('Invalid catalogue');
      if (!abort.signal.aborted) { setPieces(roughStonesOnly(body.items)); setState('ready'); }
    }).catch(() => { if (!abort.signal.aborted) setState('error'); });
    return () => abort.abort();
  }, [attempt]);
  const visible = searchRoughStones(pieces, query, species);
  const speciesOptions = [...new Set(pieces.map(piece => piece.species))].sort((a, b) => a.localeCompare(b));
  const field = 'mt-2 min-h-11 w-full rounded-xl border border-white/20 bg-[#061d19]/70 px-4 py-3 text-base text-[#eef5f2]';
  return <div data-catalogue-panel className="h-full overflow-y-auto overscroll-contain text-[#eef5f2]">
    <div className="mx-auto max-w-6xl px-6 pb-16 pt-24 sm:px-12 sm:pt-28">
      <header className="border-b border-white/15 pb-9 sm:pb-12">
        <p className="text-[10px] uppercase tracking-[0.24em] text-[#b8d0c8]">AMES · Catalogue</p>
        <h1 className="mt-5 text-[40px] font-normal leading-[1.08] tracking-[-0.04em] sm:text-6xl">The Catalogue Room</h1>
        <p className="mt-5 max-w-lg text-sm leading-6 text-[#b8d0c8]">Discover rough gemstones, from diamonds and emeralds to tourmaline, quartz and more. Explore the details of each reviewed stone.</p>
      </header>
      <section aria-labelledby="rough-catalogue-title" className="pt-8 sm:pt-10">
        <p role="status" className="mb-3 text-xs text-[#b8d0c8]">{copyStatus}</p>
        <h2 id="rough-catalogue-title" className="text-xl font-normal tracking-tight">Rough gemstones</h2>
        {state === 'loading' && <p role="status" className="py-12 text-sm text-[#b8d0c8]">Loading the catalogue…</p>}
        {state === 'error' && <div role="status" className="py-12 text-sm text-[#b8d0c8]"><p>The catalogue is unavailable. Please try again.</p><button type="button" onClick={() => { setState('loading'); setAttempt(value => value + 1); }} className="mt-4 min-h-11 rounded-full border border-white/25 px-5">Try again</button></div>}
        {state === 'ready' && pieces.length === 0 && <p role="status" className="py-12 text-sm leading-6 text-[#b8d0c8]">No reviewed rough gemstones are listed yet. New stones will appear here after review.</p>}
        {state === 'ready' && pieces.length > 0 && <>
          <div className="my-6 grid gap-4 sm:grid-cols-2">
            <label className="text-xs text-[#b8d0c8]">Search by name or reference<input type="search" value={query} onChange={event => setQuery(event.target.value)} className={field} /></label>
            <label className="text-xs text-[#b8d0c8]">Gemstone type<select value={species} onChange={event => setSpecies(event.target.value)} className={field}><option value="">All rough gemstones</option>{speciesOptions.map(name => <option key={name} value={name}>{name}</option>)}</select></label>
          </div>
          <p role="status" className="mb-5 text-xs text-[#b8d0c8]">{visible.length} {visible.length === 1 ? 'stone' : 'stones'}</p>
          {visible.length === 0 && <div className="py-8 text-sm text-[#b8d0c8]">No stones match your search.<button type="button" className="ml-3 min-h-11 underline" onClick={() => { setQuery(''); setSpecies(''); }}>Clear filters</button></div>}
          <div className="grid grid-cols-1 gap-5 min-[480px]:grid-cols-2 lg:grid-cols-3">
            {visible.map(piece => <article key={piece.stoneId} data-catalogue-stone={piece.stoneId} className="min-w-0 break-words rounded-2xl border border-white/15 bg-emerald-950/20 p-5">
              <p className="text-[10px] uppercase tracking-[0.16em] text-[#b8d0c8]">{piece.ref} · {piece.species}</p>
              <h3 className="mt-2 text-lg font-normal leading-snug">{piece.title}</h3>
              <p className="mt-3 text-sm">Rough · {piece.carats} ct</p>
              <p className="mt-2 text-xs text-[#b8d0c8]">Material origin: {piece.origin.replaceAll('-', ' ')}<br />{piece.measurements}</p>
              <p className="mt-2 text-xs">Treatments: {piece.treatments === 'none-reported' ? 'None reported' : piece.treatmentDetails}</p>
              {piece.gradeSummary && <p className="mt-2 text-xs">{piece.gradeSummary}</p>}
              {piece.reportStatus === 'verified' ? <a className="mt-4 inline-block border-b border-white/50 text-xs" href={piece.reportUrl} target="_blank" rel="noreferrer">{piece.laboratory} · {piece.reportNumber}</a> : <p className="mt-4 text-xs text-[#b8d0c8]">No laboratory report issued</p>}
              <button type="button" onClick={() => copyReference(piece)} className="mt-5 min-h-11 rounded-full border border-white/25 px-4 text-xs" aria-label={`Copy reference ${piece.ref}`}>Copy stone reference</button>
            </article>)}
          </div>
        </>}
      </section>
    </div>
  </div>;
}
