"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { profileInput, specialties, fileKinds, type ProfileInput } from '@/lib/jeweller-profile';
import type { selfProfile } from '@/lib/jeweller-onboarding';
type SelfProfile = ReturnType<typeof selfProfile>;
const api = '/api/jeweller/onboarding';
const fieldClass = 'mt-2 w-full rounded-xl border border-white/20 bg-[#061d19] px-3 py-2.5 text-base text-[#eef5f2]';
const buttonClass = 'rounded-full border border-white/25 px-4 py-2 text-sm disabled:opacity-40';
const empty = () => ({ ...profileInput.parse({ businessName: 'Draft' }), businessName: '' });
const blankShop = () => ({ slug: '', bio: '', showLocation: false, logoId: '', published: false, rightsConfirmed: false });
async function request(body?: unknown, path = api, options?: RequestInit) {
  const response = await fetch(path, options || (body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' }));
  const value = await response.json(); if (!response.ok) throw new Error(value.error || 'Unable to save your setup.'); return value;
}
export default function JewellerOnboarding() {
  const [account, setAccount] = useState<{ id: string; name: string; email: string; verified: boolean } | null>(null);
  const [profile, setProfile] = useState<SelfProfile | null>(null), [draft, setDraft] = useState<ProfileInput>(empty);
  const [shop, setShop] = useState(blankShop), [file, setFile] = useState<File | null>(null), [kind, setKind] = useState<typeof fileKinds[number]>('portfolio'), [expiresOn, setExpiresOn] = useState('');
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [reverification, setReverification] = useState(false);
  function apply(value: SelfProfile) { setProfile(value); setDraft(value.details); setShop(value.storefront || blankShop()); setReverification(false); }
  useEffect(() => {
    const abort = new AbortController(); request(undefined, api, { cache: 'no-store', signal: abort.signal }).then(body => { if (!abort.signal.aborted) { setAccount(body.account); if (body.profile) apply(body.profile); else setDraft(d => ({ ...d, email: body.account.email })); } }).catch(e => { if (!abort.signal.aborted) setError(e.message); }).finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, []);
  async function run(fn: () => Promise<void>) { setBusy(true); setError(''); setNotice(''); try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : 'Request failed'); } finally { setBusy(false); } }
  const verified = profile?.effectiveStatus === 'verified';
  const editable = !!account?.verified && profile?.status !== 'submitted' && (!verified || reverification);
  const field = (key: keyof ProfileInput, label: string, type = 'text') => <label className="block text-sm">{label}<input type={type} maxLength={key === 'address' ? 350 : 160} value={String(draft[key] ?? '')} onChange={e => setDraft(d => ({ ...d, [key]: type === 'number' ? Number(e.target.value) : e.target.value }))} className={fieldClass} /></label>;
  if (loading) return <p role="status">Loading your jeweller setup…</p>;
  return <div className="space-y-6" data-jeweller-onboarding>
    <p className="text-sm text-[#b9cec6]">Create your private business profile, complete the verification steps, then open a storefront under your verified business name. Identity and business documents stay private.</p>
    {error && <p role="alert" className="rounded-xl border border-red-300/30 p-3 text-sm text-red-200">{error}</p>}{notice && <p role="status" className="text-sm text-emerald-200">{notice}</p>}
    {!account ? <Link className="underline" href="/app/account">Create / sign in to your AMES account</Link> : <>
      <ol className="grid gap-3 text-sm sm:grid-cols-2" aria-label="Jeweller setup checklist">
        <li>1. Account email: {account.verified ? 'verified' : 'verification required'} <Link href="/app/account" className="underline">Account settings</Link></li>
        <li>2. Business details and evidence: {!profile ? 'not started' : profile.gaps.length ? `${profile.gaps.length} requirements remaining` : 'complete'}</li>
        <li>3. Staff verification: {profile?.effectiveStatus.replace(/_/g, ' ') || 'not submitted'}</li>
        <li>4. Storefront: {verified && profile?.storefront?.published ? 'live' : 'draft / not yet live'}</li>
      </ol>
      {!account.verified && <p className="rounded-xl border border-white/20 p-3 text-sm">Verify your email in <Link className="underline" href="/app/account">Account settings</Link> before creating your business profile.</p>}
      {profile?.feedback && <p className="rounded-xl border border-amber-100/30 p-3 text-sm">Staff feedback: {profile.feedback}</p>}
      {verified && <div className="flex flex-wrap gap-4 text-sm"><Link className="underline" href="/jeweller">Manage listings and CAD</Link><Link className="underline" href="/jeweller/enquiries">Customer enquiries</Link><button className="underline" onClick={() => setReverification(true)}>Edit business details (renewed review required)</button></div>}
      {reverification && <p className="text-sm text-amber-100">Changing verified business details or evidence will pause your public storefront and listings until staff verify the updated profile.</p>}
      <form onSubmit={e => { e.preventDefault(); void run(async () => { const body = await request({ action: profile ? 'save' : 'create', version: profile?.version, details: profileInput.parse(draft), confirmReverification: reverification }); apply(body.profile); setNotice('Private business profile saved.'); }); }} className="space-y-4">
        <fieldset disabled={busy || !editable} className="space-y-4 disabled:opacity-60">
          <h2 className="text-lg">Private business profile</h2>
          <div className="grid gap-4 sm:grid-cols-2">{field('businessName', 'Business / trading name')}{field('legalName', 'Legal representative name')}{field('registrationNumber', 'Business registration number')}{field('email', 'Business email', 'email')}{field('phone', 'Phone / WhatsApp with country code', 'tel')}{field('country', 'Business country')}{field('city', 'Business city')}{field('website', 'Business website (HTTPS)', 'url')}{field('experienceYears', 'Years of experience', 'number')}</div>
          {field('address', 'Private business / workshop address')}
          <label className="block text-sm">Professional biography<textarea minLength={50} maxLength={2000} value={draft.biography} onChange={e => setDraft(d => ({ ...d, biography: e.target.value }))} className={fieldClass} /></label>
          <fieldset className="space-y-2"><legend className="mb-2 text-sm">Specialties</legend><div className="flex flex-wrap gap-4 text-sm">{specialties.map(s => <label key={s} className="flex gap-2"><input type="checkbox" checked={draft.specialties.includes(s)} onChange={e => setDraft(d => ({ ...d, specialties: e.target.checked ? [...d.specialties, s] : d.specialties.filter(v => v !== s) }))} />{s}</label>)}</div></fieldset>
          <label className="flex gap-3 text-sm"><input type="checkbox" checked={draft.licenceRequired} onChange={e => setDraft(d => ({ ...d, licenceRequired: e.target.checked }))} />A trading licence is required for these activities</label>
          {draft.licenceRequired ? <div className="grid gap-3 sm:grid-cols-3">{field('licenceNumber', 'Licence number')}{field('licenceIssuer', 'Issuing authority')}{field('licenceExpires', 'Licence expiry', 'date')}</div> : <label className="block text-sm">Trading eligibility / why a licence is not applicable<textarea maxLength={1000} value={draft.eligibilityReason} onChange={e => setDraft(d => ({ ...d, eligibilityReason: e.target.value }))} className={fieldClass} /></label>}
          <label className="block text-sm">Qualifications claimed (optional)<textarea maxLength={1500} value={draft.qualifications} onChange={e => setDraft(d => ({ ...d, qualifications: e.target.value }))} className={fieldClass} /></label>
          <label className="flex gap-3 text-sm"><input type="checkbox" checked={draft.consentConfirmed} onChange={e => setDraft(d => ({ ...d, consentConfirmed: e.target.checked }))} />I am authorised to supply these business, identity and portfolio records for private verification.</label>
          <button className={buttonClass}>{profile ? 'Save business details' : 'Create business profile'}</button>
        </fieldset>
      </form>
      {profile && <>
        <section className="space-y-4 border-t border-white/20 pt-5"><h2 className="text-lg">Private verification evidence</h2><p className="text-sm text-[#b9cec6]">Supply identity and business-registration evidence, three distinct portfolio images, and evidence for any licence or qualification you claim. JPG, PNG, WebP or PDF; up to 4 MB each.</p>
          <ul className="space-y-2 text-sm">{profile.files.map(f => <li key={f.id} className="flex flex-wrap gap-3"><a className="break-all underline" href={`${api}/files/${f.id}`}>{f.filename}</a><span className="text-xs text-[#b9cec6]">{f.kind}{f.expiresOn ? ` · expires ${f.expiresOn}` : ''}</span>{editable && <button disabled={busy} className="text-xs underline" onClick={() => run(async () => { apply((await request(undefined, `${api}/files/${f.id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: profile.version, confirmReverification: reverification }) })).profile); })}>Remove</button>}</li>)}</ul>
          {editable && <div className="space-y-3"><label className="block text-sm">Evidence purpose<select value={kind} onChange={e => setKind(e.target.value as typeof kind)} className={fieldClass}>{fileKinds.map(k => <option key={k} value={k}>{k.replace(/_/g, ' ')}</option>)}</select></label><label className="block text-sm">Evidence expiry, if applicable<input type="date" value={expiresOn} onChange={e => setExpiresOn(e.target.value)} className={fieldClass} /></label><input aria-label="Choose business evidence" disabled={busy} type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" onChange={e => setFile(e.target.files?.[0] || null)} className="block w-full text-sm" /><button className={buttonClass} disabled={busy || !file || !profile.details.consentConfirmed} onClick={() => run(async () => { if (!file) return; const form = new FormData(); form.set('file', file); form.set('kind', kind); form.set('version', String(profile.version)); form.set('expiresOn', expiresOn); form.set('confirmReverification', String(reverification)); apply((await request(undefined, `${api}/files`, { method: 'POST', body: form })).profile); setFile(null); setNotice('Evidence saved privately.'); })}>Upload evidence</button></div>}
        </section>
        <section className="space-y-3"><h2 className="text-lg">{verified ? 'Business verification' : 'What remains before verification'}</h2>{profile.gaps.length ? <ul className="list-disc space-y-1 pl-5 text-sm">{profile.gaps.map(g => <li key={g}>{g}</li>)}</ul> : <p className="text-sm">{verified ? `Verified until ${profile.verifiedUntil}. Keep your business details and evidence current.` : profile.status === 'submitted' ? 'Your profile is with staff for review.' : 'The required details and evidence are complete. Submit them for staff review.'}</p>}<button disabled={busy || profile.gaps.length > 0 || profile.status === 'submitted' || verified} className={buttonClass} onClick={() => run(async () => { apply((await request({ action: 'submit', version: profile.version })).profile); setNotice('Submitted for staff verification. You can return here for status and feedback.'); })}>Submit business for verification</button></section>
        <section className="space-y-4 border-t border-white/20 pt-5"><h2 className="text-lg">Your public storefront</h2><p className="text-sm text-[#b9cec6]">Your verified trading name is used as the storefront name. Only the introduction, selected image, chosen location and published collection are public.</p>
          <label className="block text-sm">Storefront address<span className="mt-1 block text-xs text-[#b9cec6]">houseofames.com/makers/your-name</span><input readOnly={!!profile.storefront?.slug} value={shop.slug} onChange={e => setShop(s => ({ ...s, slug: e.target.value.toLowerCase() }))} maxLength={48} placeholder="your-studio-name" className={fieldClass} /></label>
          <label className="block text-sm">Public introduction<textarea value={shop.bio} onChange={e => setShop(s => ({ ...s, bio: e.target.value }))} maxLength={1000} className={fieldClass} /></label>
          <label className="block text-sm">Public storefront image<select value={shop.logoId} onChange={e => setShop(s => ({ ...s, logoId: e.target.value }))} className={fieldClass}><option value="">No image</option>{profile.files.filter(f => ['portfolio', 'portrait'].includes(f.kind)).map(f => <option key={f.id} value={f.id}>{f.filename}</option>)}</select></label>
          <label className="flex gap-3 text-sm"><input type="checkbox" checked={shop.showLocation} onChange={e => setShop(s => ({ ...s, showLocation: e.target.checked }))} />Show my business city and country (not my street address)</label>
          <label className="flex gap-3 text-sm"><input type="checkbox" checked={shop.rightsConfirmed} onChange={e => setShop(s => ({ ...s, rightsConfirmed: e.target.checked }))} />I authorise publication of this storefront introduction and selected image.</label>
          <label className="flex gap-3 text-sm"><input type="checkbox" disabled={!verified && !shop.published} checked={shop.published} onChange={e => setShop(s => ({ ...s, published: e.target.checked }))} />Open my public storefront after verification</label>
          <button disabled={busy || !account.verified} className={buttonClass} onClick={() => run(async () => { apply((await request({ action: 'storefront', version: profile.version, storefront: shop })).profile); setNotice('Storefront settings saved.'); })}>Save storefront</button>
          {verified && profile.storefront?.published && <Link href={`/makers/${profile.storefront.slug}`} className="ml-3 text-sm underline">View your public storefront</Link>}
          {!verified && <p className="text-xs text-[#b9cec6]">Your storefront and listings stay off the public site until the business is verified.</p>}
        </section>
      </>}
    </>}
  </div>;
}
