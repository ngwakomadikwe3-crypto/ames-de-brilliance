"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';

const buttonClass = 'ames-pill rounded-full border border-white/25 px-5 py-2.5 text-sm disabled:opacity-40';
export default function JewellerInviteAccept() {
  const [token, setToken] = useState(''), [state, setState] = useState<'ready' | 'busy' | 'signin' | 'done' | 'error'>('ready');
  const [message, setMessage] = useState(''), [business, setBusiness] = useState('');
  useEffect(() => { setToken(new URLSearchParams(window.location.search).get('token') || ''); }, []);
  async function accept() {
    setState('busy'); setMessage('');
    try {
      const response = await fetch('/api/jeweller/invite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
      const body = await response.json().catch(() => ({}));
      if (response.status === 401) { setState('signin'); setMessage(body.error || 'Sign in to your HOUSEofAMES account first.'); return; }
      if (!response.ok) throw new Error(body.error || 'The invite could not be accepted.');
      setBusiness(body.businessName); setState('done');
    } catch (e) { setState('error'); setMessage(e instanceof Error ? e.message : 'The invite could not be accepted.'); }
  }
  if (!token) return <p role="alert">This invite link is incomplete. Open the full link from your HOUSEofAMES email.</p>;
  if (state === 'done') return <div className="space-y-4"><p role="status" className="text-emerald-200">Welcome, {business}. Your jeweller studio is ready.</p><p className="text-sm text-[#b9cec6]">Upload a CAD file and HOUSEofAMES turns it into a 3D piece and sorts it into the right Boutique category. It appears in the Boutique once HOUSEofAMES approves it.</p><Link href="/jeweller" className={buttonClass}>Open my studio</Link></div>;
  return <div className="space-y-5" data-jeweller-invite>
    <p>HOUSEofAMES has verified your business and invited you to the jeweller studio.</p>
    <ol className="list-decimal space-y-2 pl-5 text-sm text-[#b9cec6]">
      <li><Link href="/app/account" target="_blank" className="underline">Sign in or create your HOUSEofAMES account</Link> with the email address this invite was sent to, and verify that email.</li>
      <li>Come back to this page and accept the invite.</li>
    </ol>
    {message && <p role="alert" className="rounded-xl border border-amber-200/30 p-3 text-sm text-amber-100">{message}</p>}
    <button className={buttonClass} disabled={state === 'busy'} onClick={accept}>{state === 'busy' ? 'Accepting…' : state === 'signin' ? 'I’ve signed in — accept invite' : 'Accept invite'}</button>
  </div>;
}
