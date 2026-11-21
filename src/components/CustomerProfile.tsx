"use client";
import SavedHandPanel from './SavedHandPanel';

import {LanguageSetting} from './AtelierLanguage';
import { useState, useSyncExternalStore, useCallback } from 'react';

import Link from 'next/link';

import AppAccountShell from './AppAccountShell';

import CustomerAccount, { customerRequest, type Customer } from './CustomerAccount';

import { readCustomerDisplayName, readCustomerHaptics, saveCustomerPreferences, subscribeCustomerPreferences, normalizeDisplayName } from '@/lib/customer-preferences';



export default function CustomerProfile() {

  const storedName = useSyncExternalStore(subscribeCustomerPreferences, readCustomerDisplayName, () => '');

  const storedHaptics = useSyncExternalStore(subscribeCustomerPreferences, readCustomerHaptics, () => true);

  const [draftName, setDraftName] = useState<string | null>(null);

  const [draftHaptics, setDraftHaptics] = useState<boolean | null>(null);

  const [user, setUser] = useState<Customer | null>(null);

  const [ready, setReady] = useState(false);

  const [saving, setSaving] = useState(false);

  const changeUser = useCallback((value: Customer | null) => {

    setUser(value); setDraftName(null); setDraftHaptics(null);

    if (value) { try { saveCustomerPreferences({ displayName: value.name, haptics: value.haptics }); } catch { /* Account remains available without browser storage. */ } }



  }, []);

  const [notice, setNotice] = useState('');

  const [error, setError] = useState('');

  const name = draftName ?? user?.name ?? storedName, haptics = draftHaptics ?? user?.haptics ?? storedHaptics;

  const dirty = normalizeDisplayName(name) !== (user?.name ?? storedName) || haptics !== (user?.haptics ?? storedHaptics);

  async function save(event: React.FormEvent) {

    event.preventDefault(); setNotice(''); setError('');

    setSaving(true);

    try {

      if (user) {

        const data = await customerRequest({ action: 'profile', name, haptics });

        if (!data.user) throw new Error('Your session expired. Please sign in again.');

        setUser(data.user);

        try { saveCustomerPreferences({ displayName: data.user.name, haptics: data.user.haptics }); } catch {}

      } else saveCustomerPreferences({ displayName: name, haptics });

      setDraftName(null); setDraftHaptics(null); setNotice(user ? 'Profile saved to your account.' : 'Profile saved on this device.');

    } catch (e) { setError(user ? (e as Error).message : 'Your browser could not save the profile. Allow site storage and try again; your changes are still here.'); }

    finally { setSaving(false); }

  }

  return <AppAccountShell title={user ? "Your profile" : "Your account"}>

    <div className="space-y-6" data-customer-profile>

      <LanguageSetting/>
      <CustomerAccount user={user} onChange={changeUser} onReady={setReady} />

      <details key={user?.id || 'guest'} open={user ? true : undefined}>
        <summary className="cursor-pointer py-3 text-sm">{user ? 'Profile preferences' : 'Guest settings on this device'}</summary>
      <form onSubmit={save} aria-busy={saving} className="space-y-6 rounded-2xl border border-white/15 bg-[#031815]/60 p-5">

        <label htmlFor="display-name" className="block text-sm">Display name

          <input disabled={!ready || saving} required={!!user} id="display-name" name="displayName" autoComplete="nickname" maxLength={80} value={name}

            onChange={e => { setDraftName(e.target.value); setNotice(''); setError(''); }} placeholder="Your name"

            className="mt-2 w-full rounded-xl border border-white/20 bg-[#061d19] px-3 py-3 text-base text-white" />

        </label>

        <p className="text-xs text-white">This name appears in your AMES menu. An account requires a display name.</p>

        <div className="flex items-center justify-between gap-4 border-t border-white/10 pt-5">

          <div><p className="text-sm">Haptic feedback</p><p id="haptics-help" className="mt-1 text-xs text-white">Light feedback on navigation taps, where your device supports vibration.</p></div>

          <button disabled={!ready || saving} type="button" role="switch" aria-label="Haptic feedback" aria-describedby="haptics-help" aria-checked={haptics}

            onClick={() => { setDraftHaptics(!haptics); setNotice(''); setError(''); }}

            className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors ${haptics ? 'border-emerald-200 bg-emerald-200' : 'border-white/30 bg-[#28433b]'}`}>

            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-[#061d19] transition-all ${haptics ? 'left-6' : 'left-0.5'}`} />

          </button>

        </div>

        <button type="submit" disabled={!dirty || !ready || saving} className="w-full rounded-xl bg-[#dceae2] px-4 py-3 text-sm font-medium text-[#08231e] disabled:opacity-40">{saving ? 'Saving…' : 'Save profile'}</button>

        {notice && <p role="status" className="text-sm text-emerald-200">{notice}</p>}

        {error && <p role="alert" className="text-sm text-red-200">{error}</p>}

      </form>
      </details>

      <SavedHandPanel/>
      {user && <nav aria-label="Profile links" className="flex flex-wrap gap-5 text-sm"><Link href="/app/billing" className="underline">Billing information</Link></nav>}



    </div>

  </AppAccountShell>;

}

