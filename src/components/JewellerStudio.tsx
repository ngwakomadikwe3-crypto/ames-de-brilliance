"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import EngineJewelryViewer from './EngineJewelryViewer';
import { listingInput, editable, type ListingInput, type JewellerListing, type ListingReview, type ListingFile } from '@/lib/jeweller-listing';

const endpoint = '/api/jeweller';
const blank = (): ListingInput => ({ ...listingInput.parse({ name: 'New piece', category: 'ring' }), name: '' });
const fieldClass = 'mt-2 w-full rounded-xl border border-white/20 bg-[#061d19] px-3 py-2.5 text-base text-[#eef5f2]';
const buttonClass = 'rounded-full border border-white/25 px-4 py-2 text-sm disabled:opacity-40';
async function request(path: string, options?: RequestInit) {
  const response = await fetch(path, options || { cache: 'no-store' });
  const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Request failed'); return body;
}
const patch = (id: string, body: object) => request(`${endpoint}/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
async function shaFile(file: File) {
  const bytes = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}
export default function JewellerStudio({ staff = false }: { staff?: boolean }) {
  const [rows, setRows] = useState<JewellerListing[]>([]);
  const [selected, setSelected] = useState<JewellerListing | null>(null);
  const [details, setDetails] = useState<ListingInput>(blank);
  const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true); const [access, setAccess] = useState(false);
  const [kind, setKind] = useState<ListingFile['kind']>('source'); const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0); const [units, setUnits] = useState('unknown'); const [sourceId, setSourceId] = useState('');
  const [reason, setReason] = useState(''); const [review, setReview] = useState<ListingReview | null>(null);
  const dirty = selected && JSON.stringify(selected.details) !== JSON.stringify(details);
  const canEdit = !selected || editable(selected);
  function apply(row: JewellerListing) {
    setSelected(row); setDetails(row.details); setRows(current => [row, ...current.filter(l => l.id !== row.id)]);
    setSourceId(row.files.find(f => f.kind === 'source' && f.complete && /\.(glb|obj|stl|fbx)$/i.test(f.name))?.id || '');
    setReview(row.review || { priceChecked: false, originChecked: false, rightsChecked: false, technicalChecked: false, visualChecked: false,
      madeInVerified: false, gemstoneOriginsVerified: row.details.gemstones.map(() => false), evidenceIds: [], notes: '' });
  }
  useEffect(() => {
    const abort = new AbortController();
    request(endpoint + (staff ? '?staff=1' : ''), { signal: abort.signal, cache: 'no-store' }).then(body => { if (!abort.signal.aborted) { setRows(body.listings); setAccess(true); } })
      .catch(e => { if (!abort.signal.aborted) setError(e.message); }).finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [staff]);
  useEffect(() => {
    if (!selected || dirty || !['queued', 'processing'].includes(selected.conversion?.status || '')) return;
    const abort = new AbortController();
    const timer = setInterval(() => request(`${endpoint}/${selected.id}`, { cache: 'no-store', signal: abort.signal }).then(row => { if (!abort.signal.aborted) apply(row); }).catch(e => { if (!abort.signal.aborted) setError(e.message); }), 5000);
    return () => { clearInterval(timer); abort.abort(); };
  }, [selected, dirty]);
  async function run(action: () => Promise<void>) {
    setBusy(true); setError(''); setNotice(''); setProgress(0);
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : 'Request failed'); } finally { setBusy(false); }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); await run(async () => {
      const input = listingInput.parse(details);
      const row = selected ? await patch(selected.id, { action: 'save', version: selected.version, details: input }) : await request(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
      apply(row); setNotice('Draft saved privately.');
    });
  }
  async function action(name: string) {
    if (!selected) return;
    await run(async () => { apply(await patch(selected.id, { action: name, version: selected.version, reason, review, sourceId, units })); setNotice('Listing updated.'); });
  }
  async function upload() {
    if (!selected || !file) return;
    await run(async () => {
      setProgress(0); setNotice('Preparing private upload…'); const sha256 = await shaFile(file);
      setNotice('Uploading privately…');
      const previous = selected.files.find(f => !f.complete && f.kind === kind && f.sha256 === sha256 && f.bytes === file.size);
      const started = previous ? { file: previous, chunkSize: 3 * 1024 * 1024 } : await request(`${endpoint}/${selected.id}/files`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: selected.version, file: { kind, name: file.name, bytes: file.size, sha256 } }) });
      let latest = started.listing || selected; if (started.listing) apply(started.listing);
      for (let index = started.file.parts.length; index * started.chunkSize < file.size; index++) {
        const chunk = file.slice(index * started.chunkSize, Math.min(file.size, (index + 1) * started.chunkSize));
        latest = await request(`${endpoint}/${selected.id}/files/${started.file.id}?part=${index}`, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: chunk });
        apply(latest); setProgress(Math.round(Math.min(file.size, (index + 1) * started.chunkSize) / file.size * 100));
      }
      apply(latest); setFile(null); setNotice('File uploaded privately and checksum verified.');
    });
  }
  const preview = selected?.files.find(f => f.kind === 'preview' && f.complete), poster = selected?.files.find(f => f.kind === 'poster' && f.complete);
  const fileUrl = (id: string) => `${endpoint}/${selected!.id}/files/${id}`;
  const setField = <K extends keyof ListingInput>(key: K, value: ListingInput[K]) => setDetails(d => ({ ...d, [key]: value }));
  if (loading) return <p role="status">Checking studio access…</p>;
  return <div className="space-y-6" data-jeweller-studio>
    {!staff && <nav className="flex flex-wrap gap-4 text-sm"><Link href="/jeweller/onboarding" className="underline">Business setup &amp; storefront</Link><Link href="/jeweller/enquiries" className="underline">Customer enquiries</Link><Link href="/workspace" className="underline">My workspace</Link></nav>}
    <p className="text-sm text-[#b9cec6]">{staff ? 'Review submitted designs, pricing and origin evidence. Only approved listings can be published.' : 'Your originals and evidence stay private. AMES staff review each listing before it appears in Boutique.'}</p>
    {error && <p role="alert" className="rounded-xl border border-red-300/40 p-3 text-sm text-red-200">{error}</p>}
    {notice && <p role="status" className="text-sm text-emerald-200">{notice}</p>}
    {!access ? <p className="text-sm"><Link href={staff ? '/login' : '/app/account'} className="underline">{staff ? 'Staff sign in' : 'Sign in / verify your AMES account'}</Link>{!staff && <> · <Link href="/jeweller/onboarding" className="underline">Create / complete your business setup</Link>. Existing staff-created profiles can still be linked by AMES.</>}</p> : <>
      <div className="flex flex-wrap gap-4 text-sm">{!staff && <button disabled={busy} className="underline" onClick={() => { setSelected(null); setDetails(blank()); setFile(null); }}>New listing</button>}<Link href={staff ? '/dashboard/jewellers' : '/app/account'} className="underline">{staff ? 'Jeweller verification and access' : 'Account settings'}</Link></div>
      <div className="grid gap-6 md:grid-cols-[210px_minmax(0,1fr)]">
        <nav aria-label="Your listings" className="space-y-2">{!rows.length && <p className="text-sm text-[#b9cec6]">No listings yet.</p>}{rows.map(row => <button key={row.id} disabled={busy} className={`block w-full rounded-xl border px-3 py-3 text-left text-sm ${selected?.id === row.id ? 'border-white/60' : 'border-white/15'}`} onClick={() => run(async () => apply(await request(`${endpoint}/${row.id}`)))}><span className="block">{row.details.name}</span><span className="text-xs text-[#b9cec6]">{row.status.replace(/_/g, ' ')}</span></button>)}</nav>
        <div className="min-w-0 space-y-6">
          {staff && !selected ? <p>Select a listing to review.</p> : <>
            {selected && <div><p className="text-sm">Status: {selected.status.replace(/_/g, ' ')}</p>{selected.reason && <p className="mt-2 text-sm text-amber-100">Staff feedback: {selected.reason}</p>}{selected.status === 'published' && <Link className="mt-2 inline-block text-sm underline" href={`/jewellery/${selected.id}`}>View public listing</Link>}</div>}
            <form onSubmit={save} className="space-y-4">
              <fieldset disabled={!canEdit || busy} className="space-y-4 disabled:opacity-70">
                <label className="block text-sm">Piece name<input required maxLength={120} value={details.name} onChange={e => setField('name', e.target.value)} className={fieldClass} /></label>
                <label className="block text-sm">Category<select aria-label="Category" value={details.category} onChange={e => setField('category', e.target.value as ListingInput['category'])} className={fieldClass}>{['ring', 'earrings', 'necklace', 'bracelet', 'accessory'].map(c => <option key={c} value={c}>{c === 'accessory' ? 'Accessories' : c[0].toUpperCase() + c.slice(1)}</option>)}</select></label>
                <label className="block text-sm">Description<textarea value={details.description} onChange={e => setField('description', e.target.value)} maxLength={2000} className={fieldClass} /></label>
                <div className="grid gap-4 sm:grid-cols-3"><label className="text-sm">Pricing<select value={details.priceMode} onChange={e => setField('priceMode', e.target.value as ListingInput['priceMode'])} className={fieldClass}><option value="on_request">Price on request</option><option value="fixed">Fixed price</option></select></label>{details.priceMode === 'fixed' && <><label className="text-sm">Amount<input required inputMode="decimal" value={details.amount} onChange={e => setField('amount', e.target.value)} className={fieldClass} /></label><label className="text-sm">Currency<select value={details.currency} onChange={e => setField('currency', e.target.value)} className={fieldClass}>{Intl.supportedValuesOf('currency').map(c => <option key={c}>{c}</option>)}</select></label></>}</div>
                <label className="block text-sm">Made in / country of manufacture<input value={details.madeIn} onChange={e => setField('madeIn', e.target.value)} placeholder="Leave blank if unknown or not yet manufactured" maxLength={80} className={fieldClass} /></label>
                <section className="space-y-3"><h2 className="text-sm">Gemstones and their origin</h2><p className="text-xs text-[#b9cec6]">A jeweller’s business location does not establish where a stone was mined. Leave origin blank when unknown.</p>{details.gemstones.map((gem, i) => <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"><label className="text-xs">Stone name<input required value={gem.name} onChange={e => setField('gemstones', details.gemstones.map((g, n) => n === i ? { ...g, name: e.target.value } : g))} className={fieldClass} /></label><label className="text-xs">Declared stone origin<input value={gem.origin} onChange={e => setField('gemstones', details.gemstones.map((g, n) => n === i ? { ...g, origin: e.target.value } : g))} placeholder="Country, if known" className={fieldClass} /></label><button type="button" className="self-end py-3 text-xs underline" onClick={() => setField('gemstones', details.gemstones.filter((_, n) => n !== i))}>Remove stone</button></div>)}<button type="button" disabled={details.gemstones.length >= 12} className="text-sm underline" onClick={() => setField('gemstones', [...details.gemstones, { name: '', origin: '' }])}>Add gemstone</button></section>
                <label className="block text-sm">Private provenance notes<textarea value={details.provenanceNotes} onChange={e => setField('provenanceNotes', e.target.value)} maxLength={1500} className={fieldClass} /></label>
                <label className="flex gap-3 text-sm"><input type="checkbox" checked={details.rightsConfirmed} onChange={e => setField('rightsConfirmed', e.target.checked)} />I have permission to upload these files, offer this design, and publish the exported 3D preview and product image after review.</label>
                <button className={buttonClass}>{selected ? 'Save draft' : 'Create private draft'}</button>
              </fieldset>
            </form>
            {selected && <>
              <section className="space-y-4 border-t border-white/15 pt-5"><h2>CAD, previews and evidence</h2><p className="text-xs text-[#b9cec6]">Keep the native .3dm original, plus a GLB, OBJ, STL or FBX export for conversion. Direct 3DM/STEP conversion is unavailable. Originals stay private; only the reviewed GLB preview and product image can be public.</p>
                <ul className="space-y-2">{selected.files.map(f => <li key={f.id} className="flex flex-wrap items-center gap-3 text-xs"><span className="min-w-0 break-all">{f.name} · {f.kind} · {f.complete ? 'Complete' : `${Math.round(f.parts.reduce((n, p) => n + p.bytes, 0) / f.bytes * 100)}% uploaded`}</span>{f.complete && <a href={fileUrl(f.id)} className="underline">Private download</a>}{canEdit && <button disabled={busy} className="underline" onClick={() => run(async () => apply(await request(fileUrl(f.id), { method: 'DELETE' })))}>Remove</button>}</li>)}</ul>
                {(canEdit || (staff && selected.status === 'submitted')) && <div className="space-y-3"><label className="block text-sm">File purpose<select disabled={busy} value={kind} onChange={e => setKind(e.target.value as ListingFile['kind'])} className={fieldClass}><option value="source">Original CAD / companion mesh · up to 100 MB</option><option value="preview">Exported GLB preview · up to 100 MB</option><option value="poster">Product image · up to 4 MB</option><option value="evidence">Origin / provenance evidence · up to 4 MB</option></select></label><input key={`${selected.id}-${kind}-${file === null}`} aria-label="Choose listing file" disabled={busy} type="file" accept={kind === 'source' ? '.3dm,.glb,.obj,.stl,.fbx' : kind === 'preview' ? '.glb' : kind === 'poster' ? '.png,.jpg,.jpeg,.webp' : '.pdf,.png,.jpg,.jpeg,.webp'} onChange={e => setFile(e.target.files?.[0] || null)} className="block w-full text-sm" /><button disabled={busy || !file || !!dirty} className={buttonClass} onClick={upload}>Upload privately / resume</button>{busy && progress > 0 && <p role="status" className="text-xs">Uploaded {progress}%</p>}{dirty && <p className="text-xs">Save your draft before uploading.</p>}</div>}
              </section>
              {preview && <EngineJewelryViewer key={preview.id} src={fileUrl(preview.id)} poster={poster ? fileUrl(poster.id) : undefined} autoLoad opticsProfile="soft-studio" turntableEnabled={false} alt={selected.details.name} style={{ height: 350 }} />}
              {(canEdit || (staff && selected.status === 'submitted')) && <section className="space-y-3"><h2>Convert a CAD export</h2><select aria-label="CAD source to convert" value={sourceId} onChange={e => setSourceId(e.target.value)} className={fieldClass}><option value="">Select a companion mesh export</option>{selected.files.filter(f => f.kind === 'source' && f.complete && /\.(glb|obj|stl|fbx)$/i.test(f.name)).map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select><label className="block text-sm">Declared file units<select value={units} onChange={e => setUnits(e.target.value)} className={fieldClass}>{['unknown', 'mm', 'cm', 'm', 'in'].map(v => <option key={v}>{v}</option>)}</select></label><button disabled={busy || !sourceId || !!dirty || (selected.conversion?.status === 'queued' && (!staff || !!selected.conversion.jobId)) || selected.conversion?.status === 'processing'} onClick={() => action('convert')} className={buttonClass}>{staff ? 'Queue / start workstation conversion' : 'Request conversion'}</button><p className="text-xs text-[#b9cec6]">Conversion runs on the staff workstation or connected isolated worker. You can also provide an exported GLB preview and product image for review.</p></section>}
              {staff && selected.conversion?.status === 'queued' && !selected.conversion.jobId && <p className="text-xs text-[#b9cec6]">Workstation handoff for this submission:<code className="mt-2 block select-all break-all">npm run cad:listing -- --listing {selected.id}</code></p>}
              {selected.conversion && <p role="status" className="text-sm">Conversion: {selected.conversion.status === 'queued' && !selected.conversion.jobId ? 'Queued · awaiting staff workstation or connected worker' : selected.conversion.status}{selected.conversion.error ? ` · ${selected.conversion.error}` : ''}</p>}
              {canEdit && <button disabled={busy || !!dirty || !selected.files.some(f => f.kind === 'source' && f.complete)} className={buttonClass} onClick={() => action('submit')}>Submit for staff review</button>}
              {staff && review && <section className="space-y-3 border-t border-white/20 pt-5"><h2>Staff publication review</h2><p className="text-xs text-[#b9cec6]">Publication makes the exported GLB and product image publicly downloadable. Original CAD and evidence remain private.</p>{(['priceChecked', 'originChecked', 'rightsChecked', 'technicalChecked', 'visualChecked'] as const).map(key => <label key={key} className="flex gap-3 text-sm"><input type="checkbox" checked={review[key]} onChange={e => setReview({ ...review, [key]: e.target.checked })} />{{ priceChecked: 'Price and currency checked', originChecked: 'Declared origins and unknowns reviewed', rightsChecked: 'Listing and file rights checked', technicalChecked: '3D export and source correspondence checked', visualChecked: '3D preview and product image visually approved' }[key]}</label>)}<label className="flex gap-3 text-sm"><input type="checkbox" checked={review.madeInVerified} onChange={e => setReview({ ...review, madeInVerified: e.target.checked })} />Manufacturing origin supported by evidence</label>{selected.details.gemstones.map((g, i) => <label key={i} className="flex gap-3 text-sm"><input type="checkbox" checked={review.gemstoneOriginsVerified[i] || false} onChange={e => setReview({ ...review, gemstoneOriginsVerified: review.gemstoneOriginsVerified.map((v, n) => n === i ? e.target.checked : v) })} />{g.name}: origin supported by evidence</label>)}<p className="text-xs text-[#b9cec6]">Select the private evidence you checked. Unverified declarations remain labelled as declared, never certified.</p>{selected.files.filter(f => f.kind === 'evidence' && f.complete).map(f => <label key={f.id} className="flex gap-3 text-sm"><input type="checkbox" checked={review.evidenceIds.includes(f.id)} onChange={e => setReview({ ...review, evidenceIds: e.target.checked ? [...review.evidenceIds, f.id] : review.evidenceIds.filter(id => id !== f.id) })} />{f.name}</label>)}<label className="block text-sm">Review findings<textarea minLength={20} maxLength={1500} value={review.notes} onChange={e => setReview({ ...review, notes: e.target.value })} className={fieldClass} /></label><div className="flex flex-wrap gap-3"><button disabled={busy || selected.status !== 'submitted'} className={buttonClass} onClick={() => action('approve')}>Approve listing</button><button disabled={busy || selected.status !== 'approved'} className={buttonClass} onClick={() => action('publish')}>Publish to Boutique</button></div><label className="block text-sm">Revision / rejection / withdrawal reason<textarea minLength={10} value={reason} onChange={e => setReason(e.target.value)} className={fieldClass} /></label><div className="flex flex-wrap gap-3"><button disabled={busy} className={buttonClass} onClick={() => action('request_revision')}>Request revision</button><button disabled={busy} className={buttonClass} onClick={() => action('reject')}>Reject</button><button disabled={busy || selected.status !== 'published'} className={buttonClass} onClick={() => action('unpublish')}>Withdraw public listing</button></div></section>}
            </>}
          </>}
        </div>
      </div>
    </>}
  </div>;
}
