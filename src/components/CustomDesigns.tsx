'use client';
// The eight custom-order designs in the Boutique: grid cards, the detail view (Front / Back gallery, 3D when the
// design's model exists, configuration beside the front view, "One pair, two looks" for the convertible earrings),
// the try-on entry and the made-to-order quote. The renders are shown exactly as delivered: no crop, filter or text.
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import EngineJewelryViewer from './EngineJewelryViewer';
import FittingHand from './FittingHand';
import SampleQuote from './SampleQuote';
import { useAtelierLanguage } from './AtelierLanguage';
import { designConfiguration, missingImages, type CustomDesign, type DesignImage, type WearState } from '../lib/custom-designs';

/** AVIF, then WebP, then the PNG master. Lazy unless it is the first thing on screen. */
export function DesignPicture({ image, alt, eager, sizes = '(min-width: 760px) 360px, 50vw', style }: { image: DesignImage; alt: string; eager?: boolean; sizes?: string; style?: React.CSSProperties }) {
  const set = (ext: string) => image.widths.map(w => `${image.base}-${w}.${ext} ${w}w`).join(', ');
  return (
    <picture style={{ display: 'block', width: '100%', height: '100%' }}>
      <source type="image/avif" srcSet={set('avif')} sizes={sizes} />
      <source type="image/webp" srcSet={set('webp')} sizes={sizes} />
      <img src={image.src} alt={alt} width={image.width} height={image.height} loading={eager ? 'eager' : 'lazy'} decoding="async" draggable={false}
        fetchPriority={eager ? 'high' : 'auto'} style={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain', ...style }} />
    </picture>
  );
}

/** A render that has not been delivered yet: said plainly, never stood in for by another picture. */
export function ImageToCome({ label }: { label: string }) {
  const { t } = useAtelierLanguage();
  return (
    <div role="img" aria-label={label} className="flex h-full w-full items-center justify-center rounded-2xl px-6 text-center"
      style={{ background: 'rgba(16,55,47,0.75)', border: '1px solid rgba(238,247,244,0.14)', color: '#ffffff', fontSize: 12, minHeight: 160 }}>
      {t(label)}
    </div>
  );
}

type View = 'front' | 'back';
function viewsFor(design: CustomDesign, wear: WearState) {
  // Worn as a stud, the front is the stud-alone render; the back view shows the construction either way.
  const front = design.convertible && wear === 'stud'
    ? { image: design.convertible.studFront, alt: design.convertible.studAlt, missing: 'The stud-alone front view is on its way. The back view shows how the pieces come apart.' }
    : { image: design.images.front, alt: design.alt.front, missing: 'The front view of this design is on its way.' };
  const back = { image: design.images.back, alt: design.alt.back, missing: 'The back view of this design is on its way.' };
  return { front, back };
}

/** Front / Back: a toggle and a swipe, front first, never turning on its own. */
export function DesignGallery({ design, wear = 'full', eager }: { design: CustomDesign; wear?: WearState; eager?: boolean }) {
  const { t } = useAtelierLanguage();
  const [view, setView] = useState<View>('front');
  const start = useRef<number | null>(null);
  const views = viewsFor(design, wear), current = views[view];
  const down = (e: PointerEvent) => { start.current = e.clientX; (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); };
  const up = (e: PointerEvent) => {
    if (start.current === null) return; const dx = e.clientX - start.current; start.current = null;
    if (Math.abs(dx) > 40) setView(dx < 0 ? 'back' : 'front');
  };
  return (
    <div className="flex h-full w-full flex-col" data-design-gallery={design.code} data-view={view}>
      <div className="relative min-h-0 flex-1 touch-pan-y select-none" onPointerDown={down} onPointerUp={up} onPointerCancel={() => { start.current = null; }} onDragStart={e => e.preventDefault()}>
        {current.image ? <DesignPicture key={current.image.src} image={current.image} alt={current.alt} eager={eager && view === 'front'} sizes="(min-width: 760px) 720px, 100vw" />
          : <ImageToCome label={current.missing} />}
      </div>
      <div className="mt-2 flex shrink-0 items-center justify-center gap-2" role="group" aria-label={t('View')}>
        {(['front', 'back'] as const).map(v => (
          <button key={v} type="button" className="ames-pill min-h-9 rounded-full px-4 text-[12px]" aria-pressed={view === v} onClick={() => setView(v)}>
            {t(v === 'front' ? 'Front' : 'Back')}
          </button>
        ))}
      </div>
    </div>
  );
}

const canRun3D = () => {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
};

/** The design's 3D model when it exists and runs; otherwise, or the moment it fails, the renders. */
export function DesignStage({ design, wear, eager }: { design: CustomDesign; wear: WearState; eager?: boolean }) {
  const { t } = useAtelierLanguage();
  const [mode, setMode] = useState<'3d' | 'photos'>(() => (design.glb ? '3d' : 'photos'));
  const host = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  // The engine sets the camera distance for a square-ish stage; on a narrow (portrait) stage pull it back so the
  // whole piece stays in frame. Wide stages keep the house framing.
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const el = host.current; if (!el) return;
    const fit = () => { const { width, height } = el.getBoundingClientRect(); if (width && height) setZoom(Math.round(Math.min(1, (width / height) * 0.85) * 100) / 100); };
    const watch = new ResizeObserver(fit); watch.observe(el); fit();
    return () => watch.disconnect();
  }, [mode]);
  useEffect(() => { if (design.glb && !canRun3D()) setMode('photos'); }, [design.glb]);
  // Convertible pieces: the detachable element is a separate part of the model, hidden for the stud-only look.
  const detachable = design.convertible?.parts.detachable;
  useEffect(() => {
    if (!ready || !detachable) return;
    host.current?.querySelector('canvas')?.dispatchEvent(new CustomEvent('ames:hide', { detail: { names: wear === 'stud' ? [detachable] : [] } }));
  }, [ready, wear, detachable]);
  useEffect(() => {
    // The viewer reports its state on the page; if it falls back, so do we (never a broken viewer).
    if (mode !== '3d' || !host.current) return;
    const el = host.current;
    const check = () => {
      if (el.querySelector('[data-viewer-state="fallback"]')) setMode('photos');
      setReady(!!el.querySelector('[data-viewer-state="ready"]'));
    };
    const watch = new MutationObserver(check); watch.observe(el, { subtree: true, attributes: true, attributeFilter: ['data-viewer-state'] });
    check(); return () => watch.disconnect();
  }, [mode]);
  if (mode === 'photos' || !design.glb) return <DesignGallery design={design} wear={wear} eager={eager} />;
  return (
    <div ref={host} className="relative h-full w-full">
      <EngineJewelryViewer src={design.glb} poster={design.images.front?.src} alt={design.alt.front} cameraPreset="front" zoom={zoom} autoLoad turntableEnabled={false}
        opticsProfile="mounted-gem-studio" style={{ width: '100%', height: '100%' }} />
      <button type="button" className="ames-pill absolute bottom-2 left-3 min-h-9 rounded-full px-4 text-[12px]" onClick={() => setMode('photos')}>{t('Photos')}</button>
    </div>
  );
}

/** Boutique grid card: the front view. */
export function DesignTile({ design, onOpen }: { design: CustomDesign; onOpen: () => void }) {
  const { t } = useAtelierLanguage();
  return (
    <button type="button" onClick={onOpen} data-design-tile={design.code} aria-label={`Open ${design.name}`} className="ames-piece-tile flex min-h-0 flex-col text-center" style={{ width: '100%', alignSelf: 'start' }}>
      <div className="ames-piece-image flex w-full items-center justify-center overflow-hidden" style={{ aspectRatio: design.images.front ? `${design.images.front.width} / ${design.images.front.height}` : '4 / 5' }}>
        {design.images.front ? <DesignPicture image={design.images.front} alt={design.alt.front} /> : <ImageToCome label="Front view on its way" />}
      </div>
      <div className="flex flex-col items-center gap-1 px-0.5 pt-1">
        <p className="ames-piece-name" style={{ fontFamily: 'var(--font-satoshi)', fontSize: 22, color: '#ffffff' }}>{t(design.name)}</p>
        <span style={{ fontSize: 11, color: '#ffffff' }}>{design.convertible ? t('Made to order · one pair, two looks') : t('Made to order')}</span>
      </div>
    </button>
  );
}

const TRY_ON_CATEGORIES = new Set(['watch', 'bracelet', 'earrings', 'necklace']);   // hand twin, portrait twin

/** The design detail and custom-order configuration. */
export function DesignDetail({ design, onClose, onAskSame }: { design: CustomDesign; onClose?: () => void; onAskSame?: () => void }) {
  const { t } = useAtelierLanguage();
  const [wear, setWear] = useState<WearState>('full');
  const [choice, setChoice] = useState<Record<string, string>>(() => Object.fromEntries(design.options.map(o => [o.key, o.choices[0]])));
  const configuration = useMemo(() => designConfiguration(design, choice), [design, choice]);
  const missing = missingImages(design);
  const canTryOn = !!design.glb && TRY_ON_CATEGORIES.has(design.category);
  const front = design.convertible && wear === 'stud' ? design.convertible.studFront : design.images.front;
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain pt-20" data-design-detail={design.code}>
      <div className="relative mx-auto w-full shrink-0 px-4" style={{ maxWidth: 1040, height: 'clamp(320px, 70dvh, 980px)' }}>
        {onClose && <button type="button" onClick={onClose} aria-label="Back to Boutique" className="ames-pill absolute left-5 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-full">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M15 18l-6-6 6-6" /></svg>
        </button>}
        {canTryOn
          ? <FittingHand category={design.category} title={design.name} model={design.glb!} detachable={design.convertible?.parts.detachable}
              wearLabels={design.convertible?.stateLabels}><DesignStage design={design} wear={wear} /></FittingHand>
          : <DesignStage design={design} wear={wear} eager />}
      </div>

      <div className="mx-auto w-full shrink-0 px-6 pb-7 pt-4" style={{ maxWidth: 720 }}>
        <p style={{ fontSize: 11, color: '#ffffff', letterSpacing: '0.08em' }}>{design.code} · {t('Made to order')}</p>
        <h2 style={{ fontFamily: 'var(--font-satoshi)', fontSize: 27, color: '#ffffff', lineHeight: 1.1 }}>{t(design.name)}</h2>
        <p className="mt-2 text-sm" style={{ color: '#ffffff' }}>{t(design.summary)}</p>

        {design.convertible && (
          <section className="mt-4 rounded-2xl p-4" style={{ border: '1px solid rgba(238,247,244,0.18)' }} data-convertible={design.code}>
            <h3 style={{ fontFamily: 'var(--font-satoshi)', fontSize: 19, color: '#ffffff' }}>{t('One pair, two looks')}</h3>
            <p className="mt-1 text-xs" style={{ color: '#ffffff' }}>
              {t(design.convertible.detachable === 'drop'
                ? 'Wear the stud alone by day, then lock on the drop for the evening. The detachable construction is included, not an extra.'
                : 'Wear the solitaire alone, or slide on the halo jacket. The detachable construction is included, not an extra.')}
            </p>
            <p className="mt-1 text-xs" style={{ color: '#ffffff' }}>{t(design.convertible.mechanism)}</p>
          </section>
        )}

        {/* Configuration: the front view beside the choices */}
        <section className="mt-5 grid items-start gap-4 sm:grid-cols-[150px_1fr]" aria-label={t('Configure this design')}>
          <div className="hidden overflow-hidden rounded-xl sm:sticky sm:top-24 sm:block" style={{ aspectRatio: front ? `${front.width} / ${front.height}` : '4 / 5' }}>
            {front ? <DesignPicture image={front} alt={design.convertible && wear === 'stud' ? design.convertible.studAlt : design.alt.front} sizes="150px" />
              : <ImageToCome label="Front view on its way" />}
          </div>
          <div className="space-y-4">
            {design.convertible && (
              <fieldset>
                <legend className="text-xs" style={{ color: '#ffffff' }}>{t('Wear as')}</legend>
                <div className="mt-1 flex flex-wrap gap-2">
                  {(['stud', 'full'] as const).map(s => (
                    <button key={s} type="button" aria-pressed={wear === s} onClick={() => setWear(s)} className="ames-pill min-h-10 rounded-full px-4 text-[12px]">
                      {t(design.convertible!.stateLabels[s])}
                    </button>
                  ))}
                </div>
              </fieldset>
            )}
            {design.options.map(o => (
              <fieldset key={o.key}>
                <legend className="text-xs" style={{ color: '#ffffff' }}>{t(o.label)}</legend>
                <div className="mt-1 flex flex-wrap gap-2">
                  {o.choices.map(c => (
                    <button key={c} type="button" aria-pressed={choice[o.key] === c} onClick={() => setChoice(v => ({ ...v, [o.key]: c }))} className="ames-pill min-h-10 rounded-full px-4 text-[12px]">{t(c)}</button>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
        </section>

        {/* Try on: the floating button on the stage when the design's model exists; otherwise say when it will */}
        {!canTryOn && <section className="mt-5" data-try-on-entry={design.code}>
          <p className="text-[11px]" style={{ color: '#ffffff' }}>
            {t(design.category === 'earrings' || design.category === 'necklace'
              ? 'Try-on for this design, including both ways to wear it, opens when its 3D model and the portrait try-on are ready.'
              : 'Try-on opens when this design\u2019s 3D model is ready.')}
          </p>
        </section>}

        <SampleQuote key={configuration} configuration={configuration} stone={design.name} setting={design.category} cut="" metal={choice.metal ?? ''} />
        {missing.length > 0 && <p className="mt-3 text-[10px]" style={{ color: '#ffffff' }} data-missing-images>{t('Still to come for this design')}: {missing.join(', ')}.</p>}
        {onAskSame && <button type="button" onClick={onAskSame} className="ames-pill mt-5 inline-flex min-h-11 items-center rounded-full px-5 text-[12px]">Ask SAME</button>}
      </div>
    </div>
  );
}
