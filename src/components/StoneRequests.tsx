"use client";

import { useEffect, useState } from 'react';

type Request = { id: string; status: 'requested' | 'contacted' | 'closed'; createdAt: string; version: number; stoneId: string; ref: string; title: string; carats: number;
  buyerName: string; buyerEmail: string; phone: string; message: string; note: string };
const LABEL = { requested: 'New request', contacted: 'Buyer contacted', closed: 'Closed' };

/** Purchase desk: buyers' requests to buy Catalogue Room stones. Price, KYC and payment are agreed with the buyer directly. */
export default function StoneRequests() {
  const [rows, setRows] = useState<Request[]>([]), [error, setError] = useState(''), [loading, setLoading] = useState(true), [notes, setNotes] = useState<Record<string, string>>({});
  useEffect(() => { fetch('/api/catalogue-requests?staff=1', { cache: 'no-store' }).then(async r => { const b = await r.json(); if (!r.ok) throw new Error(b.error || 'Unavailable'); setRows(b.requests); }).catch(e => setError(e.message)).finally(() => setLoading(false)); }, []);
  async function change(r: Request, status: Request['status']) {
    setError('');
    try {
      const response = await fetch(`/api/catalogue-requests/${r.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: r.version, status, note: notes[r.id] || '' }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Update failed');
      setRows(list => list.map(x => x.id === r.id ? body : x));
    } catch (e) { setError(e instanceof Error ? e.message : 'Update failed'); }
  }
  return <section className="mb-10 space-y-3" data-stone-requests>
    <h2 className="text-lg">Catalogue Room stone requests</h2>
    <p className="text-xs text-[#b9cec6]">Buyers asking to buy a catalogue stone. Agree the price, complete KYC and arrange payment with the buyer directly, then record the outcome here.</p>
    {error && <p role="alert" className="text-sm text-red-200">{error}</p>}
    {loading ? <p role="status" className="text-sm">Loading requests…</p> : !rows.length ? <p className="text-sm text-[#b9cec6]">No requests yet.</p> :
      <ul className="space-y-3">{rows.map(r => <li key={r.id} className="space-y-2 rounded-2xl border border-white/15 p-4 text-sm">
        <div className="flex flex-wrap justify-between gap-2"><span><span className="font-mono">{r.ref}</span> · {r.title} · {r.carats} ct</span><span className="text-xs text-[#b9cec6]">{LABEL[r.status]} · {r.createdAt.slice(0, 10)}</span></div>
        <p>{r.buyerName} · <a className="underline" href={`mailto:${r.buyerEmail}?subject=${encodeURIComponent(`Your request for ${r.ref}`)}`}>{r.buyerEmail}</a>{r.phone ? <> · <a className="underline" href={`https://wa.me/${r.phone.replace(/[^\d]/g, '')}`} target="_blank" rel="noreferrer">{r.phone}</a></> : null}</p>
        {r.message && <p className="text-[#b9cec6]">“{r.message}”</p>}
        {r.note && <p className="text-xs">Note: {r.note}</p>}
        <label className="block text-xs">Note for the record<input value={notes[r.id] || ''} onChange={e => setNotes(n => ({ ...n, [r.id]: e.target.value }))} maxLength={600} className="mt-1 w-full rounded-xl border border-white/20 bg-[#061d19] px-3 py-2 text-sm" /></label>
        <div className="flex flex-wrap gap-2">{r.status !== 'contacted' && <button className="ames-pill rounded-full border border-white/25 px-3 py-1.5 text-xs" onClick={() => change(r, 'contacted')}>Mark buyer contacted</button>}{r.status !== 'closed' && <button className="ames-pill rounded-full border border-white/25 px-3 py-1.5 text-xs" onClick={() => change(r, 'closed')}>Close</button>}{r.status === 'closed' && <button className="ames-pill rounded-full border border-white/25 px-3 py-1.5 text-xs" onClick={() => change(r, 'requested')}>Reopen</button>}</div>
      </li>)}</ul>}
  </section>;
}
