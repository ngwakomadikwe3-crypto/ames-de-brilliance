'use client';
// "Try on": the piece on the customer's own 3D hand (scanned from a photo, or a standard hand until then), moved by
// their real hand through the camera. It opens as a full-screen stage; the live camera overlay (AR) is the
// alternative in its ••• menu. Off, the piece's own viewer shows with one floating "Try on" button.
import dynamic from 'next/dynamic';
import { Component, useEffect, useState, type ReactNode } from 'react';
const CloneTryOn = dynamic(() => import('./CloneTryOn'), { ssr: false });
const ArTryOn = dynamic(() => import('./ArTryOn'), { ssr: false });
class SceneBoundary extends Component<{ children: ReactNode; onFail: () => void }, { failed: boolean }> {
  state = { failed: false }; static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFail(); }
  render() { return this.state.failed ? null : this.props.children; }
}
export default function FittingHand({ category, model, title, children }: { category: string; model: string; title?: string; children: ReactNode }) {
  const [on, setOn] = useState(false), [ar, setAr] = useState(false), [failed, setFailed] = useState(false);
  // full screen: lock the page behind the stage, close with Escape
  useEffect(() => {
    if (!on) return;
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOn(false); };
    addEventListener('keydown', key);
    return () => { document.body.style.overflow = prev; removeEventListener('keydown', key); };
  }, [on]);
  if (!['ring', 'bracelet', 'watch'].includes(category) || !model) return <>{children}</>;
  const close = () => { setOn(false); setAr(false); };
  const bubble = { background: '#ffffff', color: '#0c3b2e' };
  return <div className="relative h-full w-full" data-try-on-host>
    {children}
    {!failed && <button type="button" onClick={() => setOn(true)} className="absolute bottom-3 left-1/2 z-10 min-h-11 -translate-x-1/2 rounded-full px-6 text-sm font-medium shadow-lg" style={bubble} data-try-on-button>Try on</button>}
    {failed && <p role="status" className="absolute inset-x-0 bottom-3 text-center text-xs text-white">Try-on is not available on this device.</p>}
    {on && <div className="fixed inset-0 z-[80]" style={{ background: 'radial-gradient(120% 90% at 50% 35%, #0f4a3a 0%, #062a21 70%)', height: '100dvh' }} data-try-on role="dialog" aria-modal="true" aria-label={`Try on ${title ?? 'this piece'}`}>
      <SceneBoundary key={(ar ? 'ar' : 'clone') + model} onFail={() => { setFailed(true); close(); }}>
        {ar
          ? <div className="relative h-full w-full overflow-y-auto">
              <ArTryOn model={model} category={category} onUnavailable={() => setAr(false)} />
              <button type="button" aria-label="Back to my 3D hand" onClick={() => setAr(false)} className="absolute left-3 top-3 flex h-11 w-11 items-center justify-center rounded-full shadow-lg" style={bubble}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M15 18l-6-6 6-6" /></svg></button>
            </div>
          : <CloneTryOn model={model} category={category} title={title} onClose={close} onLiveCamera={() => setAr(true)} />}
      </SceneBoundary>
    </div>}
  </div>;
}
