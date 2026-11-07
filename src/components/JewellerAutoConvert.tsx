"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import EngineJewelryViewer from './EngineJewelryViewer';
import { studioCameraPreset } from '@/lib/customer-jewelry-display';
import type { JewellerListing, ListingFile } from '@/lib/jeweller-listing';
import type { ConversionResult } from '@/lib/ames-cad/convert';
import { GEMSTONES } from '@/lib/ames-cad/gems';

const endpoint = '/api/jeweller';
const fieldClass = 'mt-2 w-full rounded-xl border border-white/20 bg-[#061d19] px-3 py-2.5 text-base text-[#eef5f2]';
const buttonClass = 'ames-pill rounded-full border border-white/25 px-4 py-2 text-sm disabled:opacity-40';
const CATEGORY_LABEL: Record<string, string> = { ring: 'Rings', earrings: 'Earrings', necklace: 'Necklaces', bracelet: 'Bracelets', watch: 'Watches', accessory: 'Accessories' };
async function request(path: string, options?: RequestInit) {
  const response = await fetch(path, options || { cache: 'no-store' });
  const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Request failed'); return body;
}
async function sha256(blob: Blob) {
  const bytes = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}

/** Automatic 3D: convert the jeweller's CAD file on their own device, then publish it to the Boutique. */
export default function JewellerAutoConvert({ listing, onListing, dirty }: { listing: JewellerListing; onListing: (row: JewellerListing) => void; dirty: boolean }) {
  const [file, setFile] = useState<File | null>(null), [units, setUnits] = useState('auto'), [metal, setMetal] = useState('auto');
  const [step, setStep] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ConversionResult | null>(null), [modelUrl, setModelUrl] = useState(''), [posterUrl, setPosterUrl] = useState('');
  const [published, setPublished] = useState<JewellerListing | null>(null), [stonesChecked, setStonesChecked] = useState(false);
  useEffect(() => () => { if (modelUrl) URL.revokeObjectURL(modelUrl); if (posterUrl) URL.revokeObjectURL(posterUrl); }, [modelUrl, posterUrl]);

  async function convert() {
    if (!file) return;
    setBusy(true); setError(''); setResult(null); setPublished(null); setStonesChecked(false);
    try {
      const { convertCad } = await import('@/lib/ames-cad/convert');
      const converted = await convertCad(file, { units: units as 'auto', metal: metal as 'auto', listingName: `${listing.details.name} ${listing.details.description}`, listingGems: listing.details.gemstones.map(g => g.name), onStep: setStep });
      show(converted);
    } catch (e) { setError(e instanceof Error ? e.message : 'The file could not be converted.'); setStep(''); }
    finally { setBusy(false); }
  }
  function show(converted: ConversionResult) {
    setResult(converted);
    setModelUrl(URL.createObjectURL(new Blob([converted.glb.slice()], { type: 'model/gltf-binary' })));
    setPosterUrl(URL.createObjectURL(converted.poster)); setStep('');
  }
  /** The jeweller corrects a stone type: rebuild the model and image with it. */
  async function regem(key: string, id: string) {
    if (!result) return;
    setBusy(true); setError('');
    try { show(await result.regem({ [key]: id })); }
    catch (e) { setError(e instanceof Error ? e.message : 'The stones could not be changed.'); setStep(''); }
    finally { setBusy(false); }
  }
  async function upload(row: JewellerListing, kind: ListingFile['kind'], name: string, blob: Blob): Promise<JewellerListing> {
    const hash = await sha256(blob);
    const started = await request(`${endpoint}/${row.id}/files`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: row.version, file: { kind, name, bytes: blob.size, sha256: hash } }) });
    let latest: JewellerListing = started.listing; onListing(latest);
    for (let index = 0; index * started.chunkSize < blob.size; index++) {
      setStep(`Uploading ${kind === 'source' ? 'your original' : kind === 'preview' ? 'the 3D model' : 'the product image'}… ${Math.round(Math.min(1, (index + 1) * started.chunkSize / blob.size) * 100)}%`);
      latest = await request(`${endpoint}/${row.id}/files/${started.file.id}?part=${index}`, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: blob.slice(index * started.chunkSize, (index + 1) * started.chunkSize) });
      onListing(latest);
    }
    return latest;
  }
  async function publish() {
    if (!result || !file) return;
    setBusy(true); setError('');
    try {
      let row: JewellerListing = await request(`${endpoint}/${listing.id}`);
      // Replace any earlier 3D model, image or unfinished upload of this listing.
      for (const f of row.files.filter(f => f.kind === 'preview' || f.kind === 'poster' || !f.complete)) { setStep('Replacing the earlier preview…'); row = await request(`${endpoint}/${row.id}/files/${f.id}`, { method: 'DELETE' }); onListing(row); }
      const originalHash = await sha256(file);
      if (!row.files.some(f => f.kind === 'source' && f.complete && f.sha256 === originalHash)) {
        if (file.size > 100 * 1024 * 1024) throw new Error('Your original is over 100 MB, the private storage limit. Save a lighter copy and try again.');
        row = await upload(row, 'source', file.name, file);
      }
      row = await upload(row, 'preview', 'preview.glb', new Blob([result.glb.slice()], { type: 'model/gltf-binary' }));
      row = await upload(row, 'poster', 'poster.webp', result.poster);
      setStep('Checking the model and publishing…');
      row = await request(`${endpoint}/${row.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'auto_publish', version: row.version }) });
      onListing(row); setPublished(row); setStep('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Publishing failed.'); setStep(''); }
    finally { setBusy(false); }
  }

  const c = result?.classification, r = result?.report;
  return <section className="space-y-4 rounded-2xl border border-white/20 p-4" data-auto-convert>
    <h2>Automatic 3D — upload and publish</h2>
    <p className="text-xs text-[#b9cec6]">Choose your CAD file (.3dm, .glb, .obj, .stl or .fbx). It is converted on this device: AMES finds the metal and every stone, reads each stone's type from its name or colour in your file, gives it its real cut, sorts the piece into its Boutique category and publishes it. Your original stays private.</p>
    {published ? <div className="space-y-3"><p role="status" className="text-emerald-200">Published in the Boutique under <strong>{CATEGORY_LABEL[published.details.category] || published.details.category}</strong>.</p>
      {published.review?.automatic?.reasons?.length ? <p className="text-xs text-[#b9cec6]">Sorted because: {published.review.automatic.reasons.join('; ')}.</p> : null}
      <Link href={`/jewellery/${published.id}`} className={buttonClass}>View the public listing</Link></div> : <>
      <input aria-label="Choose CAD file" disabled={busy} type="file" accept=".3dm,.glb,.gltf,.obj,.stl,.fbx" onChange={e => { setFile(e.target.files?.[0] || null); setResult(null); }} className="block w-full text-sm" />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">File units<select disabled={busy} value={units} onChange={e => setUnits(e.target.value)} className={fieldClass}><option value="auto">Automatic</option><option value="mm">Millimetres</option><option value="cm">Centimetres</option><option value="in">Inches</option><option value="m">Metres</option></select></label>
        <label className="text-sm">Metal<select disabled={busy} value={metal} onChange={e => setMetal(e.target.value)} className={fieldClass}><option value="auto">From the file (white if unknown)</option><option value="white">White gold / platinum</option><option value="yellow">Yellow gold</option><option value="rose">Rose gold</option></select></label>
      </div>
      <button className={buttonClass} disabled={busy || !file} onClick={convert}>{result ? 'Convert again' : 'Convert to 3D'}</button>
      {result && c && r && <div className="space-y-3">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_200px]">
          <EngineJewelryViewer key={modelUrl} src={modelUrl} poster={posterUrl} alt={listing.details.name || 'Converted piece'} autoLoad opticsProfile="mounted-gem-studio" cameraPreset={studioCameraPreset(c.category)} turntableEnabled={false} style={{ height: 340 }} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={posterUrl} alt="Boutique image" className="w-full rounded-xl border border-white/10 bg-[#061d19]" />
        </div>
        <ul className="space-y-1 text-sm">
          <li>Category: <strong>{CATEGORY_LABEL[c.category]}</strong> <span className="text-xs text-[#b9cec6]">({c.confidence} confidence — {c.reasons.join('; ')})</span></li>
          <li>Size: {r.size.map(v => v.toFixed(1)).join(' × ')} mm <span className="text-xs text-[#b9cec6]">(units {r.unit}, {r.unitSource})</span></li>
          <li>Metal: {r.metal.join(', ') || '—'} · {r.metalTriangles.toLocaleString()} triangles</li>
        </ul>
        <div className="space-y-2" data-stones>
          <h3 className="text-sm">Stones {result.stones.length ? <span className="text-xs text-[#b9cec6]">— check each one; change it if AMES read it wrong</span> : null}</h3>
          {result.stones.length ? <ul className="space-y-2">{result.stones.map(g => <li key={g.key} className="grid gap-2 rounded-xl border border-white/10 p-3 sm:grid-cols-[minmax(0,1fr)_200px] sm:items-center">
            <div className="text-sm">
              <div>{g.label}{g.count > 1 ? ` · ${g.count} stones` : ''} · {g.shape} {g.size}</div>
              <div className={`text-xs ${g.source === 'assumed' ? 'text-amber-100' : 'text-[#b9cec6]'}`}>{g.source === 'name' ? `Read from your file: ${g.reason}` : g.source === 'colour' ? `Read from the stone colour: ${g.reason}` : g.source === 'listing' ? `Taken ${g.reason}` : g.source === 'chosen' ? g.reason : `Nothing in your file or listing says what ${g.count > 1 ? 'these are' : 'this is'}, so shown as ${GEMSTONES.find(s => s.id === g.gem)?.name.toLowerCase() || 'diamond'} — confirm or change it`}{g.ownFacets ? ' · kept with your own facets' : ''}</div>
            </div>
            <select aria-label={`${g.label} gemstone`} disabled={busy} value={g.gem} onChange={e => regem(g.key, e.target.value)} className={fieldClass.replace('mt-2 ', '')}>
              {GEMSTONES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </li>)}</ul> : <p className="text-xs text-[#b9cec6]">No stones found: shown as plain metal.</p>}
        </div>
        {result.stones.some(g => g.source === 'assumed') && <label className="flex items-start gap-2 rounded-xl border border-amber-200/30 p-3 text-sm text-amber-100">
          <input type="checkbox" className="mt-1" checked={stonesChecked} onChange={e => setStonesChecked(e.target.checked)} />
          <span>I have checked the stones marked in amber: the types shown are right.</span>
        </label>}
        {c.confidence === 'low' && <p className="text-xs text-amber-100">The category is uncertain. Including the type of piece in its name (for example “… ring” or “… pendant”) makes sorting certain.</p>}
        {!listing.details.rightsConfirmed && <p className="text-xs text-amber-100">Tick the permission box above and save the draft before publishing.</p>}
        <button className={buttonClass} disabled={busy || dirty || !listing.details.rightsConfirmed || (result.stones.some(g => g.source === 'assumed') && !stonesChecked)} onClick={publish}>Publish to the Boutique</button>
      </div>}
    </>}
    {step && <p role="status" className="text-sm">{step}</p>}
    {error && <p role="alert" className="rounded-xl border border-red-300/40 p-3 text-sm text-red-200">{error}</p>}
  </section>;
}
