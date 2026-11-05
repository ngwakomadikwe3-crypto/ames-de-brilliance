"use client";
import { useEffect, useState } from 'react';
export default function SocialSignIn() {
  const [enabled, setEnabled] = useState<string[]>([]), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { const controller = new AbortController(); fetch('/api/customer/oauth', { cache: 'no-store', signal: controller.signal }).then(async r => { if (!r.ok) throw new Error(); const b = await r.json(); if (!controller.signal.aborted) setEnabled(b.providers.filter((p: {enabled: boolean}) => p.enabled).map((p: {id: string}) => p.id)); }).catch(() => {}).finally(() => { if (!controller.signal.aborted) setLoading(false); }); return () => controller.abort(); }, []);
  async function signIn(provider: string) {
    setBusy(true); setError('');
    try { const r = await fetch('/api/customer/oauth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider }) }), b = await r.json(); if (!r.ok) throw new Error(b.error || 'Unable to start sign-in.'); window.location.assign(b.redirect); }
    catch (e) { setError(e instanceof Error ? e.message : 'Sign-in unavailable'); setBusy(false); }
  }
  return <div className="space-y-3" aria-label="Social sign-in"><div className="grid gap-3 sm:grid-cols-2">{[['google','Google'],['tiktok','TikTok']].map(([id,label]) => <button key={id} type="button" disabled={loading || busy || !enabled.includes(id)} onClick={() => signIn(id)} className="rounded-xl border border-white/25 px-4 py-3 text-sm disabled:opacity-40">Continue with {label}{!loading && !enabled.includes(id) ? ' · Not available yet' : ''}</button>)}</div><p className="text-xs text-[#b9cec6]">Google includes Gmail accounts. Instagram is not offered as a general sign-in option.</p>{error && <p role="alert" className="text-sm text-red-200">{error}</p>}<p className="text-center text-xs text-[#b9cec6]">Or use email</p></div>;
}
