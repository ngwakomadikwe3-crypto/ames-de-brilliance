'use client';
// A collection: the set as one live 3D still-life (stills when 3D cannot run or a model is missing), shared
// metal / stone / accent choices that change every piece at once, per-piece overrides, remove a piece, the
// package price (pieces minus the house's set discount, from two pieces up) and one quote request for it all.
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import CollectionScene from './CollectionScene';
import SampleQuote from './SampleQuote';
import { DesignPicture, ImageToCome } from './CustomDesigns';
import { useAtelierLanguage } from './AtelierLanguage';
import { collectionDesigns } from '../lib/collections';
import { designConfiguration } from '../lib/custom-designs';
import { applyShared, bundlePrice, packageRequest, resolveSet, setOverride, sharedOptions, type Choice, type CollectionEntry, type Money } from '../lib/collection-logic';

const FullSetTryOn = dynamic(() => import('./FullSetTryOn'), { ssr: false });

const money = (m: { currency: string | null; amount: number | null }) =>
  m.currency && m.amount !== null ? new Intl.NumberFormat('en-BW', { style: 'currency', currency: m.currency }).format(m.amount) : '';

const canRun3D = () => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } };

export default function CollectionView({ entry, onClose }: { entry: CollectionEntry; onClose?: () => void }) {
  const { t } = useAtelierLanguage();
  const designs = useMemo(() => collectionDesigns(entry), [entry]);
  const [state, setState] = useState<{ shared: Choice; overrides: Record<string, Choice> }>(() => ({ shared: { ...(entry.defaults ?? {}) }, overrides: {} }));
  const [removed, setRemoved] = useState<string[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [discount, setDiscount] = useState<number | null>(null), [staff, setStaff] = useState(false);
  const [prices, setPrices] = useState<Record<string, Money | null>>({});
  const [view3d, setView3d] = useState<'pending' | 'on' | 'off'>('pending');
  const [why, setWhy] = useState('');
  const [trySet, setTrySet] = useState(false);

  const shared = useMemo(() => sharedOptions(designs), [designs]);
  const resolved = useMemo(() => resolveSet(designs, state.shared, state.overrides), [designs, state]);
  const included = resolved.filter(p => !removed.includes(p.code));
  const configs = useMemo(() => Object.fromEntries(resolved.map(p => [p.code, designConfiguration(designs.find(d => d.code === p.code)!, p.choice)])), [resolved, designs]);

  // 3D only when every piece has its model and the device runs WebGL; otherwise the stills
  useEffect(() => {
    const missing = designs.filter(d => !d.glb).map(d => d.code);
    if (missing.length) { setView3d('off'); setWhy(`3D models still to come: ${missing.join(', ')}`); }
    else if (!canRun3D()) { setView3d('off'); setWhy('3D is not available on this device'); }
    else setView3d('on');
  }, [designs]);

  // the house's set discount (owner setting, default 10 %)
  useEffect(() => {
    fetch('/api/collections/settings', { cache: 'no-store' }).then(r => r.json()).then(b => { setDiscount(b.discount); setStaff(!!b.staff); }).catch(() => setDiscount(10));
  }, []);
  // each piece's published price for its current configuration
  useEffect(() => {
    const abort = new AbortController();
    for (const p of resolved) {
      const qs = new URLSearchParams({ piece: p.code, setting: p.design.category, options: configs[p.code] });
      fetch('/api/configuration-price?' + qs, { signal: abort.signal, cache: 'no-store' }).then(r => r.json())
        .then(b => setPrices(v => ({ ...v, [p.code + '|' + configs[p.code]]: b.price ?? null }))).catch(() => {});
    }
    return () => abort.abort();
  }, [resolved, configs]);
  const price = bundlePrice(included.map(p => prices[p.code + '|' + configs[p.code]] ?? null), discount ?? 10);
  const request = packageRequest(entry, included.map(p => ({ code: p.code, name: p.design.name, configuration: configs[p.code] })), price);

  const scenePieces = designs.filter(d => d.glb).map(d => {
    const r = resolved.find(p => p.code === d.code)!;
    return { code: d.code, category: d.category, glb: d.glb!, metal: r.choice.metal, accent: r.choice.accent ?? 'None', included: !removed.includes(d.code) };
  });
  const toggle = (code: string) => setRemoved(r => (r.includes(code) ? r.filter(c => c !== code) : [...r, code]));

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain pt-20" data-collection={entry.id}>
      {/* hero: the full set */}
      <div className="relative mx-auto w-full shrink-0 px-4" style={{ maxWidth: 1040, height: 'clamp(320px, 70dvh, 980px)' }}>
        {onClose && <button type="button" onClick={onClose} aria-label="Back to Boutique" className="ames-pill absolute left-5 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-full">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M15 18l-6-6 6-6" /></svg></button>}
        {view3d === 'on'
          ? (trySet ? <div className="h-full" aria-hidden /> /* one scene at a time: the still life rests while the set is tried on */
            : <CollectionScene pieces={scenePieces} onFallback={w => { setView3d('off'); setWhy(w); }} />)
          : <div className="grid h-full grid-cols-2 gap-2" data-collection-stills>
              {designs.map(d => (
                <div key={d.code} className="relative overflow-hidden rounded-2xl" style={{ opacity: removed.includes(d.code) ? 0.35 : 1 }}>
                  {d.images.front ? <DesignPicture image={d.images.front} alt={d.alt.front} eager sizes="(min-width: 760px) 400px, 50vw" /> : <ImageToCome label={`${d.name}: front view on its way`} />}
                </div>))}
            </div>}
      </div>
      {why && <p className="mx-auto mt-1 px-6 text-center text-[10px]" style={{ color: '#ffffff', maxWidth: 820 }} data-hero-fallback>{t(why)}</p>}

      <div className="mx-auto w-full shrink-0 px-6 pb-8 pt-4" style={{ maxWidth: 820 }}>
        <p style={{ fontSize: 11, color: '#ffffff', letterSpacing: '0.08em' }}>{t('Collection')} · {entry.pieces.join(' · ')}</p>
        <h2 style={{ fontFamily: 'var(--font-satoshi)', fontSize: 28, color: '#ffffff', lineHeight: 1.1 }}>{t(entry.name)}</h2>
        <p className="mt-2 text-sm" style={{ color: '#ffffff' }}>{t(entry.description)}</p>

        {/* shared choices: the whole set at once */}
        <section className="mt-5 space-y-4" aria-label={t('Choices for the whole set')} data-shared-controls>
          <h3 style={{ fontFamily: 'var(--font-satoshi)', fontSize: 18, color: '#ffffff' }}>{t('For the whole set')}</h3>
          {shared.map(o => (
            <fieldset key={o.key}>
              <legend className="text-xs" style={{ color: '#ffffff' }}>{t(o.label)}</legend>
              <div className="mt-1 flex flex-wrap gap-2">
                {o.choices.map(c => {
                  const on = resolved.every(p => !p.design.options.some(x => x.key === o.key) || p.choice[o.key] === c);
                  return <button key={c} type="button" aria-pressed={on} onClick={() => setState(s => applyShared(s.shared, s.overrides, o.key, c))} className="ames-pill min-h-10 rounded-full px-4 text-[12px]">{t(c)}</button>;
                })}
              </div>
            </fieldset>
          ))}
        </section>

        {/* the pieces: link to each design, customise one piece, remove from the set */}
        <section className="mt-6 space-y-3" aria-label={t('Pieces in this set')}>
          <h3 style={{ fontFamily: 'var(--font-satoshi)', fontSize: 18, color: '#ffffff' }}>{t('The pieces')}</h3>
          {resolved.map(p => {
            const d = designs.find(x => x.code === p.code)!, out = removed.includes(p.code);
            return (
              <article key={p.code} className="rounded-2xl p-3" style={{ border: '1px solid rgba(238,247,244,0.18)', opacity: out ? 0.6 : 1 }} data-collection-piece={p.code}>
                <div className="flex items-center gap-3">
                  <div className="h-20 w-16 shrink-0 overflow-hidden rounded-lg">{d.images.front ? <DesignPicture image={d.images.front} alt={d.alt.front} sizes="64px" /> : <ImageToCome label="Front view on its way" />}</div>
                  <div className="min-w-0 flex-1">
                    <Link href={`/designs/${p.code.toLowerCase()}`} className="underline-offset-2 hover:underline" style={{ color: '#ffffff', fontFamily: 'var(--font-satoshi)', fontSize: 17 }}>{t(d.name)}</Link>
                    <p className="text-[11px]" style={{ color: '#ffffff' }}>{p.choice.metal}{p.choice.accent && p.choice.accent !== 'None' ? ` · ${p.choice.accent} accents` : ''}{p.overridden.length ? ` · ${t('customised')}` : ''}</p>
                    {p.unavailable.length > 0 && <p className="text-[11px]" style={{ color: '#ffffff' }}>{t('Not offered in the set choice for')} {p.unavailable.join(', ')}; {t('kept as shown')}.</p>}
                  </div>
                  <button type="button" onClick={() => toggle(p.code)} aria-pressed={!out} className="ames-pill min-h-9 shrink-0 rounded-full px-3 text-[11px]">{t(out ? 'Add back' : 'Remove')}</button>
                </div>
                {!out && <button type="button" className="mt-2 text-[11px] underline" style={{ color: '#ffffff' }} onClick={() => setOpen(o => (o === p.code ? null : p.code))}>{t(open === p.code ? 'Done' : 'Customise this piece')}</button>}
                {open === p.code && !out && (
                  <div className="mt-2 space-y-3">
                    {d.options.map(o => (
                      <fieldset key={o.key}>
                        <legend className="text-[11px]" style={{ color: '#ffffff' }}>{t(o.label)}{p.overridden.includes(o.key) && <button type="button" className="ml-2 underline" onClick={() => setState(s => ({ ...s, overrides: setOverride(s.overrides, p.code, o.key, undefined) }))}>{t('use the set choice')}</button>}</legend>
                        <div className="mt-1 flex flex-wrap gap-2">
                          {o.choices.map(c => <button key={c} type="button" aria-pressed={p.choice[o.key] === c} onClick={() => setState(s => ({ ...s, overrides: setOverride(s.overrides, p.code, o.key, c) }))} className="ames-pill min-h-9 rounded-full px-3 text-[11px]">{t(c)}</button>)}
                        </div>
                      </fieldset>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </section>

        {/* the package price */}
        <section className="mt-6 rounded-2xl p-4" style={{ border: '1px solid rgba(238,247,244,0.25)' }} aria-live="polite" data-package-price>
          <h3 style={{ fontFamily: 'var(--font-satoshi)', fontSize: 18, color: '#ffffff' }}>{t('Package')} · {included.length} {t(included.length === 1 ? 'piece' : 'pieces')}</h3>
          {price.complete && price.discountPercent === 0
            ? <div className="mt-1 text-sm" style={{ color: '#ffffff' }}>
                <p style={{ fontSize: 20 }}>{t('Price')}: {money({ currency: price.currency, amount: price.total })}</p>
                <p className="text-xs">{t('Add another piece back for the set discount.')}</p>
              </div>
            : price.complete
            ? <div className="mt-1 text-sm" style={{ color: '#ffffff' }}>
                <p>{t('Bought separately')}: <s>{money({ currency: price.currency, amount: price.subtotal })}</s></p>
                <p style={{ fontSize: 20 }}>{t('Set price')}: {money({ currency: price.currency, amount: price.total })}</p>
                {price.discountPercent > 0 && <p className="text-xs">{t('You save')} {money({ currency: price.currency, amount: price.discount })} ({price.discountPercent}%)</p>}
              </div>
            : <p className="mt-1 text-sm" style={{ color: '#ffffff' }}>
                {price.discountPercent > 0 ? `${t('Set discount')}: ${price.discountPercent}% ${t('off the pieces together')}. ` : t('The set discount starts from two pieces. ')}
                {t('The house confirms the package price with your quote')}{price.missing ? ` (${price.missing} ${t(price.missing === 1 ? 'piece is' : 'pieces are')} ${t('priced on request')})` : ''}.
              </p>}
          {staff && <StaffDiscount value={discount ?? 10} onSaved={setDiscount} />}
        </section>

        {/* try on the full set */}
        <section className="mt-5" data-full-set-try-on>
          {(() => {
            const designOf = (code: string) => designs.find(d => d.code === code)!;
            const ready = included.length > 0 && included.every(p => designOf(p.code).glb);
            return <>
              <button type="button" disabled={!ready} onClick={() => setTrySet(true)} className="ames-pill min-h-11 rounded-full px-5 text-[12px]" style={{ opacity: ready ? 1 : 0.55 }}>{t('Try on the full set')}</button>
              <p className="mt-1 text-[11px]" style={{ color: '#ffffff' }}>{ready
                ? t('Earrings and necklace on your 3D portrait, the watch or bracelet on your 3D hand, together.')
                : t('Full-set try-on opens when every piece in the set has its 3D model.')}</p>
            </>;
          })()}
          {trySet && <FullSetTryOn title={entry.name} onClose={() => setTrySet(false)}
            pieces={included.map(p => { const d = designs.find(x => x.code === p.code)!;
              return { code: d.code, name: d.name, category: d.category, glb: d.glb!, detachable: d.convertible?.parts.detachable, wearLabels: d.convertible?.stateLabels }; })} />}
        </section>

        {included.length > 0
          ? <SampleQuote key={request} configuration={request.slice(0, 2000)} stone={entry.name} setting={(included.find(p => p.design.category === 'necklace') ?? included[0]).design.category}
              cut="" metal={state.shared.metal ?? included[0].choice.metal} />
          : <p className="mt-4 text-sm" style={{ color: '#ffffff' }}>{t('Add a piece back to request this set.')}</p>}
      </div>
    </div>
  );
}

function StaffDiscount({ value, onSaved }: { value: number; onSaved: (v: number) => void }) {
  const [v, setV] = useState(String(value)), [status, setStatus] = useState('');
  return (
    <form className="mt-3 flex flex-wrap items-end gap-2 text-xs" style={{ color: '#ffffff' }} onSubmit={async e => {
      e.preventDefault();
      try { const r = await fetch('/api/collections/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ discount: Number(v) }) });
        const b = await r.json(); if (!r.ok) throw Error(b.error ?? 'Not saved'); onSaved(b.discount); setStatus('Saved for every collection'); }
      catch (err) { setStatus(err instanceof Error ? err.message : 'Not saved'); }
    }}>
      <label>Staff · set discount (%) <input type="number" min={1} max={50} step={0.5} value={v} onChange={e => setV(e.target.value)} className="ml-1 w-20 rounded bg-black/30 px-2 py-1" /></label>
      <button className="ames-pill rounded-full px-3 py-1">Save</button><span role="status">{status}</span>
    </form>
  );
}
