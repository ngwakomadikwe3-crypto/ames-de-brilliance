"use client";

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { profileInput, specialties, checkLabels, blankChecks, profileGaps, effectiveProfileStatus, fileKinds,
  type ProfileInput, type AuctioneerProfile, type ReviewChecks } from '@/lib/auctioneer-profile';

const endpoint = '/api/auctioneers';
const empty = (): ProfileInput => ({ ...profileInput.parse({ businessName: 'Draft' }), businessName: '' });
const details = (profile: AuctioneerProfile) => profileInput.parse(Object.fromEntries(Object.keys(profileInput.shape).map(key => [key, profile[key as keyof ProfileInput]])));
const label = (value: string) => value.replace(/_/g, ' ').replace(/^./, s => s.toUpperCase());
async function responseData(response: Response) {
  const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Request failed'); return body;
}

export default function AuctioneerProfiles() {
  const [profiles, setProfiles] = useState<AuctioneerProfile[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState<ProfileInput>(empty);
  const [query, setQuery] = useState('');
  const [portalAccountId, setPortalAccountId] = useState('');
  const [storage, setStorage] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [checks, setChecks] = useState<ReviewChecks>(blankChecks);
  const [reason, setReason] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [kind, setKind] = useState<typeof fileKinds[number]>('reference');
  const [files, setFiles] = useState<File[]>([]);
  const [expiresOn, setExpiresOn] = useState('');
  const reload = useCallback(async () => {
    const body = await fetch(endpoint, { cache: 'no-store' }).then(responseData);
    setProfiles(body.profiles); setStorage(body.storage);
    return body;
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetch(endpoint, { cache: 'no-store', signal: controller.signal }).then(responseData).then(body => {
      if (!controller.signal.aborted) { setProfiles(body.profiles); setStorage(body.storage); }
    }).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, []);
  const selected = profiles.find(profile => profile.id === selectedId);
  const dirty = !!selected && JSON.stringify(details(selected)) !== JSON.stringify(draft);
  const gaps = selected ? profileGaps(selected) : [];
  function select(profile?: AuctioneerProfile) {
    setPortalAccountId(profile?.portalUserId || '');
    setSelectedId(profile?.id || ''); setDraft(profile ? details(profile) : empty());
    setChecks(profile?.checks || blankChecks()); setReason(''); setValidUntil(profile?.verifiedUntil || '');
    setError(''); setNotice(''); setFiles([]);
  }
  function apply(profile: AuctioneerProfile) {
    setProfiles(current => [profile, ...current.filter(item => item.id !== profile.id)]);
    select(profile);
  }
  async function run(action: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('');
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : 'Request failed'); }
    finally { setBusy(false); }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    await run(async () => {
      const profile = await fetch(selected ? `${endpoint}/${selected.id}` : endpoint, { method: selected ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(selected ? { version: selected.version, details: draft } : draft) }).then(responseData);
      apply(profile); setNotice('Saved privately. Verification is pending.');
    });
  }
  async function review(action: 'submit' | 'verify' | 'request_revision' | 'suspend') {
    if (!selected) return;
    await run(async () => {
      apply(await fetch(`${endpoint}/${selected.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: selected.version, review: { action, reason, validUntil, checks } }) }).then(responseData));
      setNotice('Review status updated.');
    });
  }
  async function upload() {
    if (!selected || !files.length) return;
    await run(async () => {
      let current = selected;
      for (const file of files) {
        const body = new FormData(); body.set('file', file); body.set('kind', kind); body.set('version', String(current.version)); body.set('expiresOn', expiresOn);
        current = await fetch(`${endpoint}/${current.id}/files`, { method: 'POST', body }).then(responseData);
        apply(current);
      }
      setNotice('Files saved privately. Verification checks have been reset.');
    });
  }
  async function removeFile(fileId: string) {
    if (!selected) return;
    await run(async () => apply(await fetch(`${endpoint}/${selected.id}/files/${fileId}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: selected.version }) }).then(responseData)));
  }
  const field = (key: keyof ProfileInput, title: string, type = 'text', required = false) => <label className="block text-sm" key={key}>{title}
    <input type={type} required={required} value={String(draft[key])} onChange={e => setDraft(current => ({ ...current, [key]: type === 'number' ? Number(e.target.value) : e.target.value }))} className="field-input mt-1 w-full" /></label>;
  const buttonStyle = 'rounded-full border border-white/25 px-4 py-2 text-sm disabled:opacity-40';
  return <div className="space-y-7" data-auctioneer-profiles>
    <p className="text-sm text-[#b9cec6]">Private onboarding and verification records. No auctioneer profile or supporting document is public.</p>
    {selected && <section className="rounded-xl border border-white/15 p-4 space-y-3"><h2>Private auctioneer portal access</h2><p className="text-xs text-[#b9cec6]">Link the account ID shown in the auctioneer’s Profile &amp; settings. They must verify their email, and this business profile must remain verified.</p><label className="block text-sm">HOUSEofAMES account ID<input value={portalAccountId} onChange={e => setPortalAccountId(e.target.value)} maxLength={36} className="field-input mt-2 w-full" /></label><button disabled={busy || dirty} className={buttonStyle} onClick={() => run(async () => { apply(await fetch(`${endpoint}/${selected.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: selected.version, portalAccountId }) }).then(responseData)); setNotice('Portal access updated.'); })}>{portalAccountId ? 'Enable / update access' : 'Revoke access'}</button></section>}
    {storage && <p className="rounded-lg border border-white/15 p-3 text-xs text-[#b9cec6]">{storage === 'local' ? 'Saved privately on this computer, outside the project folder. These records are separate from the live Appwrite database.' : 'Saved in private Appwrite collections and storage.'}</p>}
    {error && <p role="alert" className="rounded-lg border border-red-300/30 bg-red-950/30 p-3 text-sm text-red-200">{error}</p>}
    {notice && <p role="status" className="text-sm text-emerald-200">{notice}</p>}
    <div className="flex flex-wrap gap-4 text-sm"><Link href="/dashboard" className="underline">Staff dashboard</Link><button onClick={() => select()} disabled={busy} className="underline">New auctioneer</button><button onClick={() => reload().then(body => { if (selectedId) select(body.profiles.find((item: AuctioneerProfile) => item.id === selectedId)); }).catch(e => setError(e.message))} disabled={busy} className="underline">{dirty ? 'Reload and discard unsaved changes' : 'Reload records'}</button></div>
    <label className="block text-sm">Find a auctioneer<input value={query} onChange={e => setQuery(e.target.value)} className="field-input mt-1 w-full" placeholder="Business, name, city or specialty" /></label>
    <div className="grid gap-3 sm:grid-cols-2">
      {profiles.filter(profile => [profile.businessName, profile.legalName, profile.city, ...profile.specialties].join(' ').toLowerCase().includes(query.toLowerCase())).map(profile => <button key={profile.id} type="button" onClick={() => select(profile)} disabled={busy} aria-pressed={selectedId === profile.id} className={`rounded-xl border p-4 text-left ${selectedId === profile.id ? 'border-emerald-200/70 bg-emerald-950/60' : 'border-white/15 bg-[#031815]/50'}`}>
        <span className="flex items-center gap-3">
          {profile.files.find(file => file.kind === 'portrait') ? <img src={`${endpoint}/${profile.id}/files/${profile.files.find(file => file.kind === 'portrait')!.id}`} alt={`${profile.businessName} portrait`} loading="lazy" className="h-12 w-12 shrink-0 rounded-full object-cover" /> : <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-white/20 text-lg">{profile.businessName.slice(0, 1)}</span>}
          <span><span className="block text-base">{profile.businessName}</span><span className="block text-xs text-[#b9cec6]">{[profile.city, profile.country].filter(Boolean).join(', ') || 'Location pending'} · {label(effectiveProfileStatus(profile))}</span><span className="block text-xs text-[#b9cec6]">{profile.specialties.slice(0, 3).join(' · ')}</span></span>
        </span>
      </button>)}
    </div>
    {!profiles.length && storage && <p className="text-sm text-[#b9cec6]">No auctioneers added yet. Create a record with real details to begin onboarding.</p>}
    <form onSubmit={save} className="rounded-xl border border-white/15 bg-[#031815]/60 p-5">
      <fieldset disabled={busy} className="space-y-4">
        <h2 className="text-xl">{selected ? selected.businessName : 'Create auctioneer profile'}</h2>
        {dirty && <p className="text-xs text-amber-200">Unsaved changes. Saving will clear existing verification and require a new review.</p>}
        <div className="grid gap-4 sm:grid-cols-2">{field('businessName', 'Business / trading name', 'text', true)}{field('legalName', 'Legal name of proprietor / representative')}{field('registrationNumber', 'Business registration number')}{field('email', 'Business email', 'email')}{field('phone', 'Phone / WhatsApp with country code', 'tel')}{field('website', 'Website (HTTPS)', 'url')}{field('country', 'Country')}{field('city', 'City')}{field('address', 'Private business address')}{field('experienceYears', 'Years of experience', 'number')}</div>
        <label className="block text-sm">Professional biography<textarea value={draft.biography} onChange={e => setDraft(current => ({ ...current, biography: e.target.value }))} maxLength={2000} rows={4} className="field-input mt-1 w-full" /></label>
        {([ ['auctionHistory','Auction experience and professional references'], ['consignmentPolicy','Seller authority and consignment policy'], ['buyerTerms','Buyer fees, payment and delivery terms'] ] as const).map(([key,title]) => <label key={key} className="block text-sm">{title}<textarea name={key} aria-label={title} maxLength={2000} value={draft[key]} onChange={e => setDraft(d => ({ ...d, [key]: e.target.value }))} className="field-input mt-1 w-full" /></label>)}
        <fieldset><legend className="mb-2 text-sm">Specialties</legend><div className="flex flex-wrap gap-3">{specialties.map(specialty => <label key={specialty} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={draft.specialties.includes(specialty)} onChange={e => setDraft(current => ({ ...current, specialties: e.target.checked ? [...current.specialties, specialty] : current.specialties.filter(item => item !== specialty) }))} />{specialty}</label>)}</div></fieldset>
        <label className="block text-sm">Qualifications and issuing bodies<textarea maxLength={1500} value={draft.qualifications} onChange={e => setDraft(current => ({ ...current, qualifications: e.target.value }))} className="field-input mt-1 w-full" placeholder="Record exact claims and upload supporting evidence below." /></label>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={draft.licenceRequired} onChange={e => setDraft(current => ({ ...current, licenceRequired: e.target.checked }))} />An auctioneering or trading licence is required for the declared activities</label>
        {draft.licenceRequired ? <div className="grid gap-4 sm:grid-cols-2">{field('licenceNumber', 'Licence number')}{field('licenceIssuer', 'Issuing authority')}{field('licenceExpires', 'Licence expiry', 'date')}</div> : <label className="block text-sm">Basis for eligibility / licence not applicable<textarea value={draft.eligibilityReason} maxLength={1000} onChange={e => setDraft(current => ({ ...current, eligibilityReason: e.target.value }))} className="field-input mt-1 w-full" placeholder="Record the activities, jurisdiction and evidence checked; do not assume an exemption." /></label>}
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={draft.consentConfirmed} onChange={e => setDraft(current => ({ ...current, consentConfirmed: e.target.checked }))} />I confirm authority to retain the personal documents and professional evidence, and permission to use the supplied images for this private onboarding record.</label>
        <button className={buttonStyle} disabled={busy}>{busy ? 'Saving…' : selected ? 'Save changes for review' : 'Create private profile'}</button>
      </fieldset>
    </form>
    {selected && <>
      <section className="space-y-4 rounded-xl border border-white/15 p-5">
        <h2 className="text-xl">Auction references and private evidence</h2>
        <p className="text-xs text-[#b9cec6]">JPG, PNG, WebP or PDF, up to 4 MB per file. Portraits must be images. References can be images or PDFs. Evidence is accessible to its auctioneer and authorised staff.</p>
        <div className="grid grid-cols-3 gap-2">{selected.files.filter(file => ['portrait'].includes(file.kind)).map(file => <a key={file.id} href={`${endpoint}/${selected.id}/files/${file.id}`} target="_blank" rel="noreferrer"><img src={`${endpoint}/${selected.id}/files/${file.id}`} alt={`${label(file.kind)}: ${file.filename}`} loading="lazy" className="aspect-square w-full rounded-lg object-cover" /></a>)}</div>
        <div className="space-y-2">{selected.files.map(file => <div key={file.id} className="flex items-start justify-between gap-3 text-xs"><a className="break-all underline" href={`${endpoint}/${selected.id}/files/${file.id}`} target="_blank" rel="noreferrer">{label(file.kind)} · {file.filename}{file.expiresOn ? ` · expires ${file.expiresOn}` : ''}</a><button type="button" onClick={() => removeFile(file.id)} disabled={busy || dirty} className="shrink-0 text-red-200 underline">Remove</button></div>)}</div>
        <label className="block text-sm">File category<select value={kind} onChange={e => { setKind(e.target.value as typeof kind); setExpiresOn(''); setFiles([]); }} className="field-input mt-1 w-full">{fileKinds.map(value => <option key={value} value={value}>{label(value)}</option>)}</select></label>
        {!['portrait'].includes(kind) && <label className="block text-sm">Document expiry, if applicable<input type="date" value={expiresOn} onChange={e => setExpiresOn(e.target.value)} className="field-input mt-1 w-full" /></label>}
        <input key={`${selected.id}:${selected.version}:${kind}`} aria-label="Profile documents" type="file" multiple accept={['portrait'].includes(kind) ? '.jpg,.jpeg,.png,.webp' : '.jpg,.jpeg,.png,.webp,.pdf'} onChange={e => setFiles(Array.from(e.target.files || []))} disabled={busy || dirty} className="block w-full text-xs" />
        <button type="button" onClick={upload} className={buttonStyle} disabled={busy || dirty || !files.length || !selected.consentConfirmed}>Upload private files</button>
      </section>
      <section className="space-y-4 rounded-xl border border-white/15 p-5" data-auctioneer-review>
        <h2 className="text-xl">Onboarding review</h2>
        <p className="text-sm">Status: <strong>{label(effectiveProfileStatus(selected))}</strong>{selected.verifiedUntil ? ` · review valid until ${selected.verifiedUntil}` : ''}</p>
        {gaps.length > 0 ? <div className="text-sm text-[#b9cec6]">Required before review:<ul className="mt-2 list-disc space-y-1 pl-5">{gaps.map(gap => <li key={gap}>{gap}</li>)}</ul></div> : <p className="text-sm text-emerald-200">Profile requirements complete. Evidence still needs human review.</p>}
        <button type="button" onClick={() => review('submit')} disabled={busy || dirty || gaps.length > 0 || (!['draft', 'needs_revision', 'suspended'].includes(selected.status) && effectiveProfileStatus(selected) !== 'review_expired')} className={buttonStyle}>Submit for staff review</button>
        <fieldset disabled={busy || dirty || selected.status !== 'submitted'} className="space-y-3"><legend className="mb-3 text-sm">Complete only after checking the evidence</legend>{Object.entries(checkLabels).map(([key, title]) => <label key={key} className="flex items-start gap-2 text-sm"><input type="checkbox" checked={checks[key as keyof ReviewChecks]} onChange={e => setChecks(current => ({ ...current, [key]: e.target.checked }))} />{title}</label>)}</fieldset>
        <label className="block text-sm">Next review / verification expiry<input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} className="field-input mt-1 w-full" /></label>
        <label className="block text-sm">Review findings or revision / suspension reason<textarea maxLength={500} value={reason} onChange={e => setReason(e.target.value)} rows={3} className="field-input mt-1 w-full" /></label>
        <div className="flex flex-wrap gap-3"><button type="button" className={buttonStyle} onClick={() => review('verify')} disabled={busy || dirty || selected.status !== 'submitted' || Object.values(checks).some(value => !value)}>Verify AMES onboarding</button><button type="button" className={buttonStyle} onClick={() => review('request_revision')} disabled={busy || dirty}>Request revision</button><button type="button" className={buttonStyle} onClick={() => review('suspend')} disabled={busy || dirty || selected.status !== 'verified'}>Suspend verification</button></div>
        <p className="text-xs text-[#b9cec6]">AMES onboarding verification records staff checks. It is not a regulatory licence, gem certification or permission to run an auction. Review expiry must be within 12 months and cannot extend beyond a required licence.</p>
      </section>
      <section className="space-y-3"><h2 className="text-xl">Recent audit trail</h2><p className="text-xs text-[#b9cec6]">Last 50 recorded changes. Profile and document edits clear verification.</p><ol className="space-y-3 text-xs text-[#b9cec6]">{[...selected.audit].reverse().map((entry, i) => <li key={`${entry.at}:${i}`}><span className="block">{label(entry.action)} · {new Date(entry.at).toLocaleString()} · {entry.actor}</span>{entry.reason && <span>{entry.reason}</span>}</li>)}</ol></section>
    </>}
  </div>;
}
