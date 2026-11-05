"use client";

import { useEffect, useRef, useState } from 'react';

import { saveCustomerPreferences } from '@/lib/customer-preferences';
import SocialSignIn from './SocialSignIn';

export type Customer = { id?: string; name: string; email: string; verified: boolean; haptics: boolean };

export async function customerRequest(body?: Record<string, unknown>) {

  const response = await fetch('/api/customer', body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' });

  const data = await response.json();

  if (!response.ok) throw new Error(data.error || 'Unable to reach your account.');

  return data as { user?: Customer | null; message?: string };

}

const inputClass = 'mt-2 w-full rounded-xl border border-white/20 bg-[#061d19] px-3 py-3 text-base text-[#eef5f2]';

export default function CustomerAccount({ user, onChange, onReady }: { user: Customer | null; onChange: (user: Customer | null) => void; onReady: (ready: boolean) => void }) {

  const [mode, setMode] = useState('login');

  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);

  const [error, setError] = useState(''), [notice, setNotice] = useState('');

  const [link, setLink] = useState<{ userId: string; secret: string } | null>(null);
  const oauthOutcome = useRef<string | null>(null);

  useEffect(() => {

    let active = true;

    const query = new URLSearchParams(location.search);
    if (query.has('oauth')) {
      oauthOutcome.current = query.get('oauth');
      history.replaceState(null, '', location.pathname);
    }
    const outcome = oauthOutcome.current;
    if (outcome) void Promise.resolve().then(() => { if (active) { oauthOutcome.current = null; if (outcome === 'failed') setError('Social sign-in could not be completed. Please try again or use email.'); else if (outcome === 'cancelled') setNotice('Social sign-in was cancelled.'); else setNotice('Complete your contact email and verification to continue.'); } });

    if (['reset', 'verify'].includes(query.get('flow') || '') && query.get('userId') && query.get('secret')) {

      void Promise.resolve().then(() => { if (active) { setMode(query.get('flow')!); setLink({ userId: query.get('userId')!, secret: query.get('secret')! }); } });

      history.replaceState(null, '', location.pathname);

    }

    customerRequest().then(data => { if (active) { onChange(data.user ?? null); onReady(true); } }).catch(e => {

      if (active) { if (e.message.includes('expired')) onReady(true); else setError(e.message); }

    }).finally(() => { if (active) setLoading(false); });

    return () => { active = false; };

  }, [onChange, onReady]);

  async function perform(body: Record<string, unknown>) {

    setBusy(true); setError(''); setNotice('');

    try {

      const data = await customerRequest(body);

      if (body.action === 'logout') { try { saveCustomerPreferences({ displayName: '', haptics: true }); } catch {} }

      if ('user' in data) { onChange(data.user ?? null); onReady(true); }

      setNotice(data.message || (body.action === 'logout' ? 'You are signed out.' : 'You are signed in.'));

      if (body.action === 'reset' || body.action === 'confirm-verification') { setMode('login'); setLink(null); }

    } catch (e) { setError((e as Error).message); }

    finally { setBusy(false); }

  }

  function submit(event: React.FormEvent<HTMLFormElement>) {

    event.preventDefault(); const data = new FormData(event.currentTarget);

    const body: Record<string, unknown> = { action: mode === 'verify' ? 'confirm-verification' : mode, ...Object.fromEntries(data), ...link };

    void perform(body);

  }

  return <section aria-label="Customer account" className="space-y-4 rounded-2xl border border-white/15 bg-[#031815]/60 p-5">

    <h2 className="text-xl">Your AMES account</h2>

    {loading ? <p role="status">Checking your account…</p> : user && !link ? <>

      <p className="break-all text-sm">{user.email}</p><a href="/workspace" className="text-sm underline">Open my workspace</a>
        {user.id && <details className="text-xs text-[#b9cec6]"><summary>Account reference for AMES support</summary><p className="mt-2">If AMES already created your business profile, staff can link it using this account reference.</p><code className="break-all select-all">{user.id}</code><p className="mt-2"><a href="/jeweller/onboarding" className="underline">Set up my jeweller business</a></p></details>}

      <p className="text-xs text-[#b9cec6]">{user.verified ? 'Email verified' : 'Email not verified yet'} · Customer account</p>
      {!user.email && <form className="space-y-3" onSubmit={e => { e.preventDefault(); const form = new FormData(e.currentTarget); void perform({ action: 'complete-social-email', email: form.get('email'), password: form.get('password') }); }}><p className="text-sm text-[#b9cec6]">Add a contact email before sending enquiries or opening a professional profile. This also gives you an email sign-in option.</p><label className="block text-sm">Contact email<input name="email" type="email" required maxLength={254} className={inputClass} autoComplete="email" /></label><label className="block text-sm">Set an AMES password<input name="password" type="password" required minLength={12} maxLength={128} className={inputClass} autoComplete="new-password" /></label><button disabled={busy} className="rounded-full border border-white/25 px-4 py-2 text-sm">Save contact email</button></form>}

      <div className="flex flex-wrap gap-4 text-sm">

        {!user.verified && !!user.email && <button disabled={busy} onClick={() => void perform({ action: 'verify' })} className="underline disabled:opacity-40">Send verification email</button>}

        <button disabled={busy} onClick={() => void perform({ action: 'logout' })} className="underline disabled:opacity-40">Sign out</button>

        <button disabled={busy} onClick={() => void perform({ action: 'recover', email: user.email })} className="underline disabled:opacity-40">Reset password</button>

      </div>

    </> : <>

      <p className="text-sm text-[#b9cec6]">Sign in to save your name and preferences across devices.</p>
      {!link && ['login', 'register'].includes(mode) && <SocialSignIn />}

      {!link && <div className="flex flex-wrap gap-4 text-sm" aria-label="Account options">{[['login', 'Sign in'], ['register', 'Create account'], ['recover', 'Forgot password']].map(([value, label]) => <button key={value} disabled={busy} type="button" aria-pressed={mode === value} onClick={() => { setMode(value); setError(''); setNotice(''); }} className={mode === value ? 'underline text-white' : 'text-[#b9cec6]'}>{label}</button>)}</div>}

      <form onSubmit={submit} className="space-y-4">

        {mode === 'register' && <label className="block text-sm">Display name<input required name="name" autoComplete="nickname" maxLength={80} className={inputClass} /></label>}

        {!link && <label className="block text-sm">Email<input required name="email" type="email" autoComplete="email" maxLength={254} className={inputClass} /></label>}

        {['login', 'register', 'reset'].includes(mode) && <label className="block text-sm">{mode === 'reset' ? 'New password' : 'Password'}<input required name="password" type="password" minLength={mode === 'login' ? 1 : 12} maxLength={128} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} className={inputClass} />{mode !== 'login' && <span className="mt-1 block text-xs text-[#b9cec6]">At least 12 characters. Use a unique password.</span>}</label>}

        <button disabled={busy} className="w-full rounded-xl bg-[#dceae2] px-4 py-3 text-sm font-medium text-[#08231e] disabled:opacity-40">{busy ? 'Please wait…' : ({ login: 'Sign in', register: 'Create account', recover: 'Send reset link', reset: 'Set new password', verify: 'Confirm email verification' } as Record<string, string>)[mode]}</button>

      </form>

    </>}

    {notice && <p role="status" className="text-sm text-emerald-200">{notice}</p>}

    {error && <p role="alert" className="text-sm text-red-200">{error}</p>}

  </section>;

}

