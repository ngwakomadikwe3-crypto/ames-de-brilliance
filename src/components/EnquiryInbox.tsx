"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { enquiryView } from '@/lib/customer-enquiry';
type Enquiry = ReturnType<typeof enquiryView>;
const field = 'mt-2 w-full rounded-xl border border-white/20 bg-[#061d19] px-3 py-2.5 text-base text-[#eef5f2]';
const button = 'rounded-full border border-white/25 px-4 py-2 text-sm disabled:opacity-40';
export default function EnquiryInbox({ role = 'customer' }: { role?: 'customer' | 'jeweller' | 'staff' }) {
  const [rows, setRows] = useState<Enquiry[]>([]), [selectedId, setSelectedId] = useState(''), [message, setMessage] = useState(''), [amount, setAmount] = useState(''), [currency, setCurrency] = useState('USD');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true);
  async function reload() {
    const r = await fetch(`/api/enquiries?role=${role}`, { cache: 'no-store' }), b = await r.json(); if (!r.ok) throw new Error(b.error || 'Enquiries unavailable'); setRows(b.enquiries);
    setSelectedId(current => current || new URLSearchParams(location.search).get('enquiry') || b.enquiries[0]?.id || '');
  }
  useEffect(() => { let active = true; const abort = new AbortController(); fetch(`/api/enquiries?role=${role}`, { cache: 'no-store', signal: abort.signal }).then(async r => { const b = await r.json(); if (!r.ok) throw new Error(b.error || 'Enquiries unavailable'); if (active) { setRows(b.enquiries); setSelectedId(new URLSearchParams(location.search).get('enquiry') || b.enquiries[0]?.id || ''); } }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; abort.abort(); }; }, [role]);
  const selected = rows.find(r => r.id === selectedId);
  async function action(name: string) {
    if (!selected) return; setBusy(true); setError('');
    try { const r = await fetch(`/api/enquiries/${selected.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: name, version: selected.version, message, amount, currency }) }), b = await r.json(); if (!r.ok) throw new Error(b.error || 'Unable to update enquiry'); setRows(rs => [b, ...rs.filter(r => r.id !== b.id)]); setMessage(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Request failed'); } finally { setBusy(false); }
  }
  return <section className="space-y-4" data-enquiry-inbox><div className="flex items-center justify-between gap-4"><h2 className="text-xl">{role === 'customer' ? 'My enquiries' : 'Customer enquiries'}</h2><button className="text-sm underline" disabled={busy} onClick={() => reload().catch(e => setError(e.message))}>Refresh replies</button></div>
    {loading && <p role="status">Loading enquiries…</p>}{error && <p role="alert" className="text-sm text-red-200">{error} <Link className="underline" href={role === 'staff' ? '/login' : '/app/account'}>Account / sign in</Link></p>}
    {!loading && !error && !rows.length && <p className="text-sm text-[#b9cec6]">{role === 'customer' ? 'Open a published piece and ask the jeweller about availability, sizing or a quote.' : 'Enquiries for your published pieces will appear here.'}</p>}
    <div className="grid gap-5 md:grid-cols-[210px_minmax(0,1fr)]"><nav aria-label="Enquiry threads" className="space-y-2">{rows.map(r => <button key={r.id} onClick={() => { setSelectedId(r.id); setMessage(''); }} className={`block w-full rounded-xl border p-3 text-left text-sm ${selectedId === r.id ? 'border-white/60' : 'border-white/15'}`}><span className="block">{r.pieceName}</span><span className="text-xs text-[#b9cec6]">{role === 'customer' ? r.businessName : r.buyerName} · {r.status}</span></button>)}</nav>
      {selected && <div className="min-w-0 space-y-4"><h3>{selected.pieceName}</h3>{'buyerEmail' in selected && <p className="break-all text-xs text-[#b9cec6]">Customer consented contact: {selected.buyerEmail}</p>}<div className="space-y-3">{selected.messages.map((m, i) => <div key={i} className="rounded-xl border border-white/15 p-3"><p className="text-[11px] text-[#b9cec6]">{m.by} · {new Date(m.at).toLocaleString()}</p><p className="mt-1 whitespace-pre-wrap text-sm">{m.text}</p></div>)}</div>
        {selected.quote && <p className="text-sm">Quote: {new Intl.NumberFormat(undefined, { style: 'currency', currency: selected.quote.currency }).format(Number(selected.quote.amount))}</p>}
        {selected.status !== 'closed' && <><label className="block text-sm">Message<textarea maxLength={1500} value={message} onChange={e => setMessage(e.target.value)} className={field} /></label><div className="flex flex-wrap gap-3"><button disabled={busy || !message.trim()} className={button} onClick={() => action('reply')}>Send reply</button>{role === 'customer' && selected.status === 'quoted' && <button disabled={busy} className={button} onClick={() => action('accept')}>Request purchase at this quote</button>}<button disabled={busy} className={button} onClick={() => action('close')}>Close enquiry</button></div>
          {role === 'jeweller' && selected.status !== 'accepted' && <div className="space-y-3 border-t border-white/15 pt-4"><h4>Send a quote</h4><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Amount<input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} className={field} /></label><label className="text-sm">Currency<select value={currency} onChange={e => setCurrency(e.target.value)} className={field}>{Intl.supportedValuesOf('currency').map(c => <option key={c}>{c}</option>)}</select></label></div><p className="text-xs text-[#b9cec6]">Include sizing, availability and terms in the message above. A quote or purchase request does not record payment or guarantee stock.</p><button disabled={busy || !amount || message.trim().length < 5} className={button} onClick={() => action('quote')}>Send quote</button></div>}</>}
        {selected.status === 'accepted' && <p className="text-xs text-[#b9cec6]">Purchase requested. Confirm availability, payment and delivery with the customer; this enquiry is not marked paid.</p>}
      </div>}
    </div>
  </section>;
}
