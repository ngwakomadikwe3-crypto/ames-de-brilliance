"use client";
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import EngineJewelryViewer from './EngineJewelryViewer';
import type { JewellerListing } from '@/lib/jeweller-listing';
import type { JewellerProfile } from '@/lib/jeweller-profile';

/**
 * The Owner's approvals inbox: everything waiting for a decision in one place. Pieces jewellers have sent (each
 * opens here with its 3D model, details and stock, to approve or send back), jeweller accounts waiting for
 * verification, and stone 3D models waiting for approval. Oldest first, so nothing waits longest by accident.
 */
type Stone = { id: string; ref: string; stone_type: string; shape: string; carat: number; photo: string; threeD: { status: string } };
type Queue = 'pieces' | 'accounts' | 'stones';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, options ?? { cache: 'no-store' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Request failed');
  return body as T;
}
const ago = (iso: string) => {
  const h = Math.max(0, (Date.now() - new Date(iso).getTime()) / 36e5);
  return h < 1 ? 'just now' : h < 24 ? `${Math.floor(h)} h ago` : `${Math.floor(h / 24)} d ago`;
};
const price = (l: JewellerListing) => l.details.priceMode === 'fixed' && l.details.amount
  ? new Intl.NumberFormat(undefined, { style: 'currency', currency: l.details.currency }).format(Number(l.details.amount)) : 'Price on request';
const fileUrl = (l: JewellerListing, kind: 'poster' | 'preview') => { const f = l.files.find(x => x.kind === kind && x.complete); return f ? `/api/jeweller/${l.id}/files/${f.id}` : ''; };
const pill = 'ames-pill inline-flex min-h-11 items-center justify-center rounded-full border border-white/20 px-4 text-xs disabled:opacity-40';
const label = 'text-[10px] uppercase tracking-[0.16em] text-[#9fbcb1]';

export default function OwnerApprovals() {
  const [listings, setListings] = useState<JewellerListing[]>([]);
  const [profiles, setProfiles] = useState<JewellerProfile[]>([]);
  const [stones, setStones] = useState<Stone[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading'), [error, setError] = useState('');
  const [queue, setQueue] = useState<Queue>('pieces'), [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const [l, p, s] = await Promise.all([
        request<{ listings: JewellerListing[] }>('/api/jeweller?staff=1'),
        request<{ profiles: JewellerProfile[] }>('/api/jewellers').catch(() => ({ profiles: [] })),
        request<{ stones: Stone[] }>('/api/stone-3d').catch(() => ({ stones: [] })),
      ]);
      setListings(l.listings); setProfiles(p.profiles); setStones(s.stones); setState('ready');
    } catch (e) { setError(e instanceof Error ? e.message : 'Approvals are unavailable'); setState('error'); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const maker = useMemo(() => new Map(profiles.map(p => [p.id, p.businessName])), [profiles]);
  const pieces = listings.filter(l => l.status === 'submitted').sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  const accounts = profiles.filter(p => p.status === 'submitted').sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  const stone3d = stones.filter(s => s.threeD.status === 'awaiting_approval');
  const counts: Record<Queue, number> = { pieces: pieces.length, accounts: accounts.length, stones: stone3d.length };
  const total = counts.pieces + counts.accounts + counts.stones;
  const openPiece = pieces.find(l => l.id === open) ?? null;

  if (state === 'loading') return <p role="status" className="py-10 text-sm text-[#b8d0c8]">Loading what is waiting…</p>;
  if (state === 'error') return <div role="alert" className="py-10 text-sm"><p>{error}</p><button className={`${pill} mt-4`} onClick={() => { setState('loading'); load(); }}>Try again</button></div>;

  return <div className="text-[#eef5f2]" data-owner-approvals>
    <p className="text-sm text-[#b8d0c8]">{total ? `${total} waiting for your decision.` : 'Nothing is waiting. New pieces, jeweller accounts and stone models appear here.'}</p>
    <nav className="mt-5 flex gap-2 overflow-x-auto" aria-label="Approval queues">
      {([['pieces', 'Pieces'], ['accounts', 'Jeweller accounts'], ['stones', 'Stone 3D']] as [Queue, string][]).map(([q, name]) =>
        <button key={q} type="button" onClick={() => { setQueue(q); setOpen(null); }} aria-pressed={queue === q}
          className={`${pill} shrink-0 gap-2 ${queue === q ? 'bg-white/10 border-white/40' : ''}`}>{name}
          {counts[q] > 0 && <span className="min-w-5 rounded-full bg-emerald-300/80 px-1.5 text-[10px] font-semibold text-[#04201b]">{counts[q]}</span>}</button>)}
    </nav>

    {queue === 'pieces' && (openPiece
      ? <PieceReview piece={openPiece} maker={maker.get(openPiece.jewellerId) ?? 'Jeweller'} onBack={() => setOpen(null)} onDone={async () => { setOpen(null); await load(); }} />
      : <section className="mt-5 grid gap-3 sm:grid-cols-2" aria-label="Pieces waiting">
        {!pieces.length && <Empty text="No pieces are waiting. Pieces jewellers send appear here, oldest first." />}
        {pieces.map(l => <button key={l.id} type="button" onClick={() => setOpen(l.id)} className="flex min-w-0 gap-3 rounded-2xl border border-white/15 bg-emerald-950/20 p-3 text-left hover:border-white/30" data-approval-piece={l.id}>
          {fileUrl(l, 'poster') ? <img src={fileUrl(l, 'poster')} alt="" className="h-20 w-20 shrink-0 rounded-xl object-cover" /> : <span className="h-20 w-20 shrink-0 rounded-xl bg-white/5" />}
          <span className="min-w-0 text-xs leading-5">
            <span className="block truncate text-sm">{l.details.name}</span>
            <span className="block truncate text-[#b8d0c8]">{maker.get(l.jewellerId) ?? 'Jeweller'} · {l.details.category}</span>
            <span className="block text-[#b8d0c8]">{price(l)}{l.details.stock != null ? ` · ${l.details.stock} in stock` : ''}</span>
            <span className="block text-[#9fbcb1]">Sent {ago(l.updatedAt)}</span>
          </span>
        </button>)}
      </section>)}

    {queue === 'accounts' && <section className="mt-5 grid gap-3 sm:grid-cols-2" aria-label="Jeweller accounts waiting">
      {!accounts.length && <Empty text="No jeweller accounts are waiting for verification." />}
      {accounts.map(p => <div key={p.id} className="rounded-2xl border border-white/15 bg-emerald-950/20 p-4 text-xs leading-5" data-approval-account={p.id}>
        <p className="text-sm">{p.businessName}</p>
        <p className="text-[#b8d0c8]">{[p.city, p.country].filter(Boolean).join(', ') || 'Location not given'}{p.specialties.length ? ` · ${p.specialties.slice(0, 3).join(', ')}` : ''}</p>
        <p className="text-[#9fbcb1]">{p.files.length} document{p.files.length === 1 ? '' : 's'} · sent {ago(p.updatedAt)}</p>
        <Link href={`/dashboard/jewellers#${p.id}`} className={`${pill} mt-3`}>Review documents and verify</Link>
      </div>)}
    </section>}

    {queue === 'stones' && <section className="mt-5 grid gap-3 sm:grid-cols-2" aria-label="Stone 3D waiting">
      {!stone3d.length && <Empty text="No stone 3D models are waiting for approval." />}
      {stone3d.map(s => <div key={s.id} className="flex gap-3 rounded-2xl border border-white/15 bg-emerald-950/20 p-3 text-xs leading-5">
        {s.photo ? <img src={s.photo} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" /> : <span className="h-16 w-16 shrink-0 rounded-xl bg-white/5" />}
        <span className="min-w-0"><span className="block text-sm">{s.ref} · {s.stone_type}</span><span className="block text-[#b8d0c8]">{s.shape} · {s.carat} ct</span>
          <Link href={`/dashboard/stone-3d#${s.id}`} className="mt-1 inline-block underline">Review the 3D model</Link></span>
      </div>)}
    </section>}
  </div>;
}

function Empty({ text }: { text: string }) {
  return <p className="col-span-full rounded-2xl border border-dashed border-white/15 p-6 text-sm text-[#b8d0c8]">{text}</p>;
}

/** One piece, opened in the inbox: the 3D model, what the jeweller sent, stock, and the decision. */
function PieceReview({ piece, maker, onBack, onDone }: { piece: JewellerListing; maker: string; onBack: () => void; onDone: () => Promise<void> }) {
  const [stock, setStock] = useState(piece.details.stock == null ? '' : String(piece.details.stock));
  const [reason, setReason] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const auto = piece.review?.automatic, preview = fileUrl(piece, 'preview'), poster = fileUrl(piece, 'poster');
  async function act(action: 'approve_converted' | 'request_revision' | 'reject') {
    setBusy(true); setError('');
    try {
      await request(`/api/jeweller/${piece.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, version: piece.version, reason, stock: stock.trim() === '' ? null : Math.max(0, Math.floor(Number(stock)) || 0) }) });
      await onDone();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save the decision'); } finally { setBusy(false); }
  }
  const rows: [string, string][] = [
    ['Jeweller', maker], ['Category', piece.details.category], ['Price', price(piece)],
    ['Stock sent', piece.details.stock == null ? 'Not stated' : String(piece.details.stock)],
    ...(auto ? [['Stones', `${auto.stones} set${auto.melee ? ` · ${auto.melee} pavé` : ''}`] as [string, string], ['Size', `${auto.size.map(v => Number(v).toFixed(1)).join(' × ')} mm`] as [string, string],
      ['Sorted as', `${piece.details.category} (${auto.confidence})`] as [string, string]] : []),
    ['Made in', piece.details.madeIn || 'Not stated'],
  ];
  return <section className="mt-5" aria-label={`Review ${piece.details.name}`} data-approval-review={piece.id}>
    <button type="button" onClick={onBack} className={pill}>‹ All pieces</button>
    <div className="mt-4 grid gap-5 md:grid-cols-[1.2fr_1fr]">
      <div className="ames-jewelry-stage relative overflow-hidden rounded-2xl" style={{ height: 'clamp(260px, 46dvh, 460px)' }}>
        {preview ? <EngineJewelryViewer key={preview} src={preview} poster={poster || undefined} alt={piece.details.name} autoLoad opticsProfile={auto ? 'mounted-gem-studio' : 'soft-studio'} turntableEnabled={false} style={{ width: '100%', height: '100%' }} />
          : <p className="p-6 text-sm text-[#b8d0c8]">No 3D model yet.</p>}
      </div>
      <div className="text-xs leading-5">
        <h2 className="text-xl">{piece.details.name}</h2>
        {piece.details.description && <p className="mt-2 text-[#d6e6e0]">{piece.details.description}</p>}
        <dl className="mt-3 grid grid-cols-[5.5rem_1fr] gap-x-3 gap-y-1.5 border-t border-white/10 pt-3">
          {rows.map(([k, v]) => <div key={k} className="contents"><dt className="text-[#9fbcb1]">{k}</dt><dd className="capitalize-first">{v}</dd></div>)}
        </dl>
        {auto ? <>
          <label className={`${label} mt-5 block`}>Pieces in stock to publish
            <input type="number" min={0} max={99999} inputMode="numeric" value={stock} onChange={e => setStock(e.target.value)} placeholder="Not stated"
              className="mt-2 block w-full rounded-xl border border-white/20 bg-[#061d19] px-3 py-2.5 text-base normal-case tracking-normal text-[#eef5f2]" /></label>
          <button type="button" disabled={busy} onClick={() => act('approve_converted')} className={`${pill} mt-3 w-full border-emerald-200/50 bg-emerald-300/15 text-sm`}>Approve and publish</button>
        </> : <Link href={`/dashboard/listings?piece=${piece.id}`} className={`${pill} mt-5 w-full`}>Open the full review (origin and evidence checks)</Link>}
        <label className={`${label} mt-5 block`}>Reason, to send back or reject
          <textarea value={reason} onChange={e => setReason(e.target.value)} minLength={10} rows={3} placeholder="What the jeweller should change"
            className="mt-2 block w-full rounded-xl border border-white/20 bg-[#061d19] px-3 py-2.5 text-sm normal-case tracking-normal text-[#eef5f2]" /></label>
        <div className="mt-3 flex gap-2">
          <button type="button" disabled={busy || reason.trim().length < 10} onClick={() => act('request_revision')} className={`${pill} flex-1`}>Send back for changes</button>
          <button type="button" disabled={busy || reason.trim().length < 10} onClick={() => act('reject')} className={`${pill} flex-1`}>Reject</button>
        </div>
        {error && <p role="alert" className="mt-3 text-red-200">{error}</p>}
      </div>
    </div>
  </section>;
}
