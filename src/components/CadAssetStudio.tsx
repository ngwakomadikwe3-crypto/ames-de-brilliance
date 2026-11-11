"use client";

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import EngineJewelryViewer from './EngineJewelryViewer';
import type { CadJob } from '@/lib/cad-types';

const endpoint = '/api/cad-studio';
const categories = [['accessory', 'Accessories'], ['ring', 'Rings'], ['earrings', 'Earrings'], ['necklace', 'Necklaces'], ['bracelet', 'Bracelets'], ['watch', 'Watches']];
export default function CadAssetStudio() {
  const [jobs, setJobs] = useState<CadJob[]>([]);
  const [maxBytes, setMaxBytes] = useState(4 * 1024 * 1024);
  const [online, setOnline] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('accessory');
  const [units, setUnits] = useState('unknown');
  const [source, setSource] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [authRequired, setAuthRequired] = useState(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(endpoint, { cache: 'no-store', signal });
    const body = await response.json();
    if (!response.ok) {
      if (!signal?.aborted) { setAuthRequired(response.status === 401 || response.status === 403); setOnline(false); }
      throw new Error(body.error || 'CAD Assets is unavailable');
    }
    if (!signal?.aborted) {
      setMaxBytes(body.maxBytes); setJobs(body.jobs); setOnline(body.worker.online); setError(''); setAuthRequired(false);
      setSelectedId(current => current || body.jobs[0]?.id || '');
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try { await load(controller.signal); }
      catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Queue unavailable'); }
      finally { if (!controller.signal.aborted) timer = setTimeout(poll, 4000); }
    };
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [load]);
  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!source || busy) return;
    if (source.size > maxBytes || !/\.(glb|obj|stl|fbx)$/i.test(source.name)) {
      setError(`Choose a GLB, OBJ, STL or FBX file, up to ${Math.floor(maxBytes / 1024 / 1024)} MB.`); return;
    }
    setBusy(true); setError('');
    try {
      const body = new FormData(); body.set('source', source); body.set('name', name); body.set('category', category); body.set('units', units);
      const response = await fetch(endpoint, { method: 'POST', body });
      const job = await response.json();
      if (!response.ok) throw new Error(job.error || 'Upload failed');
      setSelectedId(job.id); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Upload failed'); }
    finally { setBusy(false); }
  }
  async function rerender() {
    if (!selectedId || busy) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`${endpoint}/${selectedId}`, { method: 'POST' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Re-render failed');
      setSelectedId(body.id); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Re-render failed'); }
    finally { setBusy(false); }
  }
  const selected = jobs.find(job => job.id === selectedId);
  const artifact = (file: string) => `${endpoint}/${selected?.id}/${file}`;
  return <div className="space-y-8" data-cad-studio>
    <p className="text-sm text-[#b9cec6]">Upload a design, convert it privately, and download a reusable 3D asset pack. Nothing is added to the Boutique automatically.</p>
    <p role="status" className="text-sm">Blender renderer: <span className={online ? 'text-emerald-300' : 'text-[#b9cec6]'}>{online ? 'Ready' : 'Offline'}</span></p>
    {!online && !authRequired && <p className="text-sm text-[#b9cec6]">The rendering service must be connected and running before a design can be processed.</p>}
    {error && <p role="alert" className="rounded-lg border border-red-300/30 bg-red-950/30 p-3 text-sm text-red-200">{error}</p>}
    {authRequired && <Link className="underline text-sm" href="/login">Sign in with your owner account</Link>}
    <form onSubmit={upload} className="space-y-4 rounded-xl border border-white/15 bg-[#031815]/60 p-5">
      <h2 className="text-xl">Create a 3D asset</h2>
      <label className="block text-sm">Asset name<input required maxLength={120} value={name} onChange={e => setName(e.target.value)} className="field-input mt-1 w-full" placeholder="e.g. Silver cuff" /></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">Category<select value={category} onChange={e => setCategory(e.target.value)} className="field-input mt-1 w-full">{categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="block text-sm">Source units<select value={units} onChange={e => setUnits(e.target.value)} className="field-input mt-1 w-full">{[['unknown', 'Not confirmed'], ['mm', 'Millimetres'], ['cm', 'Centimetres'], ['m', 'Metres'], ['in', 'Inches']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </div>
      <label className="block text-sm">CAD / 3D export<input required type="file" accept=".glb,.obj,.stl,.fbx" onChange={e => setSource(e.target.files?.[0] || null)} className="mt-2 block w-full text-sm" /></label>
      <p className="text-xs text-[#b9cec6]">GLB, OBJ, STL or FBX · up to {Math.floor(maxBytes / 1024 / 1024)} MB. Export Rhino/Matrix .3dm or STEP to one of these formats first. Embed GLB textures; external textures are not imported.</p>
      <button disabled={busy || !online || !source || authRequired} className="rounded-full border border-white/30 px-5 py-2.5 text-sm disabled:opacity-40">{busy ? 'Uploading…' : 'Upload and create 3D asset'}</button>
      {busy && <progress className="block w-full" aria-label="Uploading CAD design" />}
    </form>
    <section className="space-y-3">
      <h2 className="text-xl">Your conversions</h2>
      {!jobs.length && <p className="text-sm text-[#b9cec6]">Your uploaded designs will appear here.</p>}
      {!!jobs.length && <label className="block text-sm">Select design<select value={selectedId} onChange={e => setSelectedId(e.target.value)} className="field-input mt-1 w-full">{jobs.map(job => <option key={job.id} value={job.id}>{job.name} · {job.status}</option>)}</select></label>}
      {selected && <div className="space-y-4">
        <p role="status" className="text-sm">{selected.sourceFilename} · {selected.status === 'ready' ? '3D asset ready for review' : selected.status === 'queued' ? 'Waiting for the conversion worker' : selected.status === 'processing' ? 'Converting geometry and rendering the preview…' : 'Conversion failed'}</p>
        {(selected.status === 'ready' || selected.status === 'failed') && <button disabled={busy || !online} onClick={rerender} className="rounded-full border border-white/30 px-5 py-2.5 text-sm disabled:opacity-40">Re-render with latest settings</button>}
        {selected.error && <p role="alert" className="text-sm text-red-200">{selected.error}</p>}
        {selected.status === 'ready' && selected.result && <>
          <div className="h-80 overflow-hidden rounded-xl border border-white/10"><EngineJewelryViewer key={selected.id} src={artifact('preview.glb')} poster={artifact('poster.png')} alt={selected.name} autoLoad opticsProfile="soft-studio" cameraPreset="three_quarter" /></div>
          <div className="flex flex-wrap gap-5 text-sm underline"><a href={artifact('asset-pack.zip')}>Download 3D asset pack</a><a href={artifact('preview.glb')} download>GLB</a><a href={artifact('poster.png')} download>Transparent render</a><a href={artifact('result.json')}>Conversion report</a></div>
          <p className="text-sm text-[#b9cec6]">The pack includes the 3D model, render, source checksum, and AMES Chat, Boutique and Media contracts. All contracts remain pending review.</p>
          <ul className="list-disc space-y-1 pl-5 text-xs text-[#b9cec6]">{selected.result.limitations.map(item => <li key={item}>{item}</li>)}</ul>
        </>}
      </div>}
    </section>
  </div>;
}
