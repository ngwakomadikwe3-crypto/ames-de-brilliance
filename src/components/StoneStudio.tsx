"use client";

import { useEffect, useState } from 'react';
import EngineJewelryViewer from './EngineJewelryViewer';
import { GEMSTONES } from '@/lib/ames-cad/gems';
import { chunkUpload } from '@/lib/chunk-upload';
import type { StoneModel, StoneSpecs } from '@/lib/ames-cad/stone';

type ThreeD = { status: string; scan: { name: string; bytes: number; complete: boolean } | null; hasModel: boolean; approved: boolean; source: string | null; note: string; gemId: string; version: number; revision?: string };
type Row = { id: string; ref: string; stone_type: string; shape: string; carat: number; color: string; clarity: string; category: string; crystal_form: string; status: string; source: string; photo: string; threeD: ThreeD };
type Detail = { role: 'owner' | 'staff'; stone: Record<string, unknown>; review: { title: string; species: string; otherSpecies: string; form: string; measurements: string; carats: number } | null; published: boolean; threeD: ThreeD };

const field = 'mt-2 w-full rounded-xl border border-white/20 bg-[#061d19] px-3 py-2.5 text-base text-[#eef5f2]';
const button = 'ames-pill rounded-full border border-white/25 px-4 py-2 text-sm disabled:opacity-40';
const STATUS: Record<string, string> = { none: 'No 3D yet', scan_uploaded: 'Dealer scan received', converting: 'Being converted', awaiting_approval: 'Waiting for the Owner’s approval', approved: 'Approved for the catalogue', withdrawn: 'Withdrawn' };
const FILTERS = [['todo', 'Needs 3D'], ['waiting', 'Waiting for approval'], ['approved', 'Approved'], ['all', 'All stones']] as const;
async function request(path: string, init?: RequestInit) {
  const response = await fetch(path, init || { cache: 'no-store' }), body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Request failed'); return body;
}

/** Staff convert dealers' stones to 3D and send them for approval; the Owner approves them for the Catalogue Room. */
export default function StoneStudio() {
  const [rows, setRows] = useState<Row[]>([]), [role, setRole] = useState<'owner' | 'staff'>('staff'), [filter, setFilter] = useState<typeof FILTERS[number][0]>('todo');
  const [detail, setDetail] = useState<Detail | null>(null), [error, setError] = useState(''), [step, setStep] = useState(''), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true);
  const [gemId, setGemId] = useState('stone-diamond'), [units, setUnits] = useState('auto'), [model, setModel] = useState<StoneModel | null>(null), [modelUrl, setModelUrl] = useState(''), [posterUrl, setPosterUrl] = useState('');
  useEffect(() => { request('/api/stone-3d').then(b => { setRows(b.stones); setRole(b.role); }).catch(e => setError(e.message)).finally(() => setLoading(false)); }, []);
  useEffect(() => () => { if (modelUrl) URL.revokeObjectURL(modelUrl); if (posterUrl) URL.revokeObjectURL(posterUrl); }, [modelUrl, posterUrl]);

  const specs = (d: Detail): StoneSpecs => {
    const s = d.stone, r = d.review, form = (r?.form === 'rough' || r?.form === 'polished' ? r.form : String(s.stone_type) === 'rough' ? 'rough' : 'polished') as StoneSpecs['form'];
    return { ref: String(s.ref), form, shape: String(s.shape || ''), carat: Number(r?.carats || s.carat) || 0, color: String(s.color || ''), measurements: r?.measurements || '',
      describe: [r?.species === 'other-precious-stone' ? r.otherSpecies : r?.species, r?.title, s.category, s.crystal_form].filter(Boolean).join(' ') };
  };
  async function run(task: () => Promise<void>) { setBusy(true); setError(''); try { await task(); } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong'); } finally { setBusy(false); setStep(''); } }
  async function open(row: Row) {
    await run(async () => {
      const d: Detail = await request(`/api/stone-3d/${row.id}`); setDetail(d); setModel(null); setModelUrl(''); setPosterUrl('');
      const { stoneGem } = await import('@/lib/ames-cad/stone'); setGemId(d.threeD.gemId || stoneGem(specs(d)));
    });
  }
  function show(m: StoneModel) { setModel(m); setModelUrl(URL.createObjectURL(new Blob([m.glb.slice()], { type: 'model/gltf-binary' }))); setPosterUrl(URL.createObjectURL(m.poster)); }
  async function fromScan() {
    if (!detail?.threeD.scan) return;
    await run(async () => {
      setStep('Downloading the dealer’s scan…');
      const response = await fetch(`/api/stone-3d/${detail.stone.id}/scan`); if (!response.ok) throw new Error('The scan could not be downloaded.');
      const { convertStoneScan } = await import('@/lib/ames-cad/stone');
      show(await convertStoneScan(new File([await response.blob()], detail.threeD.scan!.name), specs(detail), { units: units as 'auto', gemId, onStep: setStep }));
    });
  }
  async function fromSpecs() {
    if (!detail) return;
    await run(async () => { const { buildStoneFromSpecs } = await import('@/lib/ames-cad/stone'); show(await buildStoneFromSpecs(specs(detail), { gemId, onStep: setStep })); });
  }
  async function send() {
    if (!detail || !model) return;
    const id = String(detail.stone.id);
    await run(async () => {
      for (const [f, blob, name] of [['model', new Blob([model.glb.slice()], { type: 'model/gltf-binary' }), 'stone.glb'], ['poster', model.poster, 'poster.webp']] as const)
        await chunkUpload(blob, name, file => ({ url: `/api/stone-3d/${id}`, method: 'PATCH', body: { action: 'start', field: f, file } }), i => `/api/stone-3d/${id}?field=${f}&part=${i}`, p => setStep(`Uploading the ${f === 'model' ? '3D model' : 'picture'}… ${p}%`));
      setStep('Checking the model and sending it for approval…');
      const body = await request(`/api/stone-3d/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save', details: { source: model.source, gemId: model.gemId, size: model.size, note: model.note } }) });
      update(id, body.threeD); setModel(null);
    });
  }
  async function decide(action: 'approve' | 'withdraw') {
    if (!detail) return; const id = String(detail.stone.id);
    await run(async () => { const body = await request(`/api/stone-3d/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) }); update(id, body.threeD); });
  }
  function update(id: string, threeD: ThreeD) { setRows(r => r.map(x => x.id === id ? { ...x, threeD } : x)); setDetail(d => d && String(d.stone.id) === id ? { ...d, threeD } : d); }

  const visible = rows.filter(r => filter === 'all' || (filter === 'todo' ? ['none', 'scan_uploaded', 'converting', 'withdrawn'].includes(r.threeD.status) : filter === 'waiting' ? r.threeD.status === 'awaiting_approval' : r.threeD.status === 'approved'));
  if (loading) return <p role="status">Loading stones…</p>;
  const s = detail && specs(detail), stored = detail?.threeD.hasModel ? `/api/stone-3d/${detail.stone.id}/model.glb?v=${detail.threeD.revision || detail.threeD.version}` : '';
  return <div className="space-y-6" data-stone-studio>
    <p className="text-sm text-[#b9cec6]">{role === 'owner' ? 'Approve each stone’s 3D before buyers see it in the Catalogue Room. The stone itself is published through Stone verification.' : 'Convert dealers’ stones to 3D: from the dealer’s scan, or for polished stones from their shape and measurements. Each 3D goes to the Owner for approval.'}</p>
    {error && <p role="alert" className="rounded-xl border border-red-300/40 p-3 text-sm text-red-200">{error}</p>}
    <div className="flex flex-wrap gap-2">{FILTERS.map(([k, label]) => <button key={k} className={`${button} ${filter === k ? 'border-white/70' : ''}`} onClick={() => setFilter(k)}>{label} ({rows.filter(r => k === 'all' || (k === 'todo' ? ['none', 'scan_uploaded', 'converting', 'withdrawn'].includes(r.threeD.status) : k === 'waiting' ? r.threeD.status === 'awaiting_approval' : r.threeD.status === 'approved')).length})</button>)}</div>
    <div className="grid gap-6 md:grid-cols-[230px_minmax(0,1fr)]">
      <nav aria-label="Stones" className="space-y-2">{!visible.length && <p className="text-sm text-[#b9cec6]">No stones here.</p>}{visible.map(r => <button key={r.id} disabled={busy} onClick={() => open(r)} className={`block w-full rounded-xl border px-3 py-3 text-left text-sm ${detail && String(detail.stone.id) === r.id ? 'border-white/60' : 'border-white/15'}`}>
        <span className="block font-mono text-xs">{r.ref}</span><span className="block">{r.stone_type === 'rough' ? 'Rough' : r.shape || 'Polished'} · {r.carat} ct{r.color ? ` · ${r.color}` : ''}</span>
        <span className="text-xs text-[#b9cec6]">{STATUS[r.threeD.status] || r.threeD.status}{r.threeD.scan?.complete && r.threeD.status !== 'approved' ? ' · scan ready' : ''}</span></button>)}</nav>
      <div className="min-w-0 space-y-5">
        {!detail || !s ? <p>Select a stone.</p> : <>
          <div className="space-y-1 text-sm">
            <h2 className="text-lg">{detail.review?.title || String(detail.stone.ref)}</h2>
            <p>{s.form === 'rough' ? 'Rough' : 'Polished'} · {s.shape || '—'} · {s.carat} ct · {s.color || 'colour not stated'}{s.measurements ? ` · ${s.measurements}` : ''}</p>
            <p className="text-xs text-[#b9cec6]">{STATUS[detail.threeD.status]}{detail.published ? ' · stone published in the catalogue' : ' · stone not yet published (Stone verification)'}</p>
            <p className="text-xs text-[#b9cec6]">Dealer’s scan: {detail.threeD.scan ? `${detail.threeD.scan.name} (${(detail.threeD.scan.bytes / 1024 / 1024).toFixed(1)} MB${detail.threeD.scan.complete ? '' : ', upload unfinished'})` : 'none — the dealer can upload one from their portal'}</p>
          </div>
          {stored && !model && <div className="space-y-3 rounded-2xl border border-white/15 p-4">
            <h3 className="text-sm">Current 3D {detail.threeD.approved ? '(live in the catalogue once the stone is published)' : ''}</h3>
            <EngineJewelryViewer key={stored} src={stored} alt={String(detail.stone.ref)} autoLoad opticsProfile="mounted-gem-studio" cameraPreset="gemstone" turntableEnabled={false} style={{ height: 300 }} />
            <p className="text-xs text-[#b9cec6]">{detail.threeD.note}</p>
            {role === 'owner' && <div className="flex flex-wrap gap-3">
              {detail.threeD.status !== 'approved' && <button disabled={busy} className={button} onClick={() => decide('approve')}>Approve for the Catalogue Room</button>}
              {detail.threeD.status === 'approved' && <button disabled={busy} className={button} onClick={() => decide('withdraw')}>Withdraw the 3D</button>}
            </div>}
          </div>}
          <section className="space-y-3 rounded-2xl border border-white/15 p-4">
            <h3 className="text-sm">{stored ? 'Make a new 3D' : 'Make the 3D'}</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">Gemstone<select disabled={busy} value={gemId} onChange={e => setGemId(e.target.value)} className={field}>{GEMSTONES.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
              <label className="text-sm">Scan units<select disabled={busy} value={units} onChange={e => setUnits(e.target.value)} className={field}><option value="auto">Automatic</option><option value="mm">Millimetres</option><option value="cm">Centimetres</option><option value="in">Inches</option><option value="m">Metres</option></select></label>
            </div>
            <div className="flex flex-wrap gap-3">
              <button disabled={busy || !detail.threeD.scan?.complete} className={button} onClick={fromScan}>Convert the dealer’s scan</button>
              <button disabled={busy || s.form === 'rough'} className={button} onClick={fromSpecs}>Build from shape and measurements</button>
            </div>
            {s.form === 'rough' && !detail.threeD.scan?.complete && <p className="text-xs text-amber-100">Rough crystals need the dealer’s scan: their shape can’t be built from measurements. Until then the catalogue shows the dealer’s photo.</p>}
            {model && <div className="space-y-3">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
                <EngineJewelryViewer key={modelUrl} src={modelUrl} poster={posterUrl} alt={String(detail.stone.ref)} autoLoad opticsProfile="mounted-gem-studio" cameraPreset="gemstone" turntableEnabled={false} style={{ height: 300 }} />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={posterUrl} alt="Catalogue picture" className="w-full rounded-xl border border-white/10 bg-[#061d19]" />
              </div>
              <p className="text-sm">{GEMSTONES.find(g => g.id === model.gemId)?.name} · {model.size.map(v => v.toFixed(2)).join(' × ')} mm</p>
              <p className="text-xs text-[#b9cec6]">{model.note}</p>
              <button disabled={busy} className={button} onClick={send}>{role === 'owner' ? 'Save the 3D' : 'Send for approval'}</button>
            </div>}
          </section>
        </>}
        {step && <p role="status" className="text-sm">{step}</p>}
      </div>
    </div>
  </div>;
}
