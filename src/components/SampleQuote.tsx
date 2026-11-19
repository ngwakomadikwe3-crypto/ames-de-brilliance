'use client';
import {useAtelierLanguage} from './AtelierLanguage';
import { useState, type FormEvent } from 'react';

export default function SampleQuote({ stone, setting, cut, metal, caseShape }: {stone: string; setting: string; cut: string; metal: string; caseShape?: string}) {
  const {t}=useAtelierLanguage();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reference, setReference] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    const data = new FormData(event.currentTarget);
    data.set('type', 'Made-to-order jewellery');
    data.set('shape', setting);
    data.set('color', stone);
    data.set('notes', [stone + ' ' + setting, 'Metal: ' + metal, caseShape && 'Case shape: ' + caseShape, cut && (setting==='necklace'?'Drop cut: ':'Centre cut: ') + cut, 'Please confirm supplier availability, total price, currency and lead time.', data.get('preferences')].filter(Boolean).join('\n'));
    try {
      const response = await fetch('/api/sourcing', {method:'POST', body:data});
      const result = await response.json();
      if (!response.ok || !result.id) throw Error();
      setReference(result.id);
    } catch { setError('Your request could not be confirmed. Please try again.'); }
    finally { setBusy(false); }
  }
  return <details className="mt-3 border-t border-white/15 text-sm">
    <summary className="cursor-pointer py-3">{t('Request a made-to-order quote')}</summary>
    {reference ? <p role="status">Request {reference} received for your {stone} {setting}.</p> :
      <form onSubmit={submit} className="grid gap-3 py-2">
        <p>This {stone} {setting} is a design sample. AMES will request supplier pricing and a lead time for your approval.</p>
        {([['name','Name','text'],['contact','Email','email'],['country','Delivery country','text'],['preferences','Size, metal or budget (optional)','text']] as const).map(([name,label,type]) =>
          <label key={name}>{label}<input className="mt-1 block min-h-11 w-full rounded-lg bg-[#10372f] px-3" name={name} type={type} required={name !== 'preferences'} maxLength={name === 'preferences' ? 500 : 150}/></label>)}
        <label><input required type="checkbox" name="consent" /> AMES may contact me about this quote.</label>
        <button disabled={busy} className="ames-pill min-h-11 rounded-full">{busy ? 'Sending…' : 'Request quote'}</button>
        {error && <p role="alert">{error}</p>}
      </form>}
  </details>;
}
