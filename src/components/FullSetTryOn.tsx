'use client';
// A collection's full set, tried on at once: the earrings and necklace on the portrait twin, the watch or bracelet on
// the hand twin. Two stages on one screen: stacked on a phone held upright, side by side in landscape. Each stage
// keeps its own controls (Customize, camera); the portrait wears every neck and ear piece together.
import dynamic from 'next/dynamic';
import { Component, useEffect, useState, type ReactNode } from 'react';
const PortraitTryOn = dynamic(() => import('./PortraitTryOn'), { ssr: false });
const CloneTryOn = dynamic(() => import('./CloneTryOn'), { ssr: false });

export type SetPiece = { code: string; name: string; category: string; glb: string; detachable?: string; wearLabels?: { stud: string; full: string } };
const PORTRAIT = ['earrings', 'necklace', 'pendant'], WRIST = ['watch', 'bracelet'];

class Boundary extends Component<{ children: ReactNode; label: string }, { failed: boolean }> {
  state = { failed: false }; static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <p className="flex h-full items-center justify-center p-6 text-center text-xs text-white">{this.props.label} is not available on this device.</p> : this.props.children; }
}

export default function FullSetTryOn({ title, pieces, onClose }: { title: string; pieces: SetPiece[]; onClose: () => void }) {
  const face = pieces.filter(p => PORTRAIT.includes(p.category)), wrist = pieces.filter(p => WRIST.includes(p.category));
  const [onWrist, setOnWrist] = useState(0);
  useEffect(() => {
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', key); return () => { document.body.style.overflow = prev; removeEventListener('keydown', key); };
  }, [onClose]);
  // the portrait's main piece: the earrings when there are any (their "Wear as" stays available), the rest worn with them
  const main = face.find(p => p.category === 'earrings') ?? face[0], others = face.filter(p => p !== main);
  const bubble = { background: '#ffffff', color: '#0c3b2e' };
  return <div className="fixed inset-0 z-[80] flex flex-col landscape:flex-row" style={{ background: 'radial-gradient(120% 90% at 50% 35%, #0f4a3a 0%, #062a21 70%)', height: '100dvh' }}
    role="dialog" aria-modal="true" aria-label={`Try on ${title}`} data-full-set-stage>
    {main && <div className="relative min-h-0 flex-[1.25] landscape:flex-1" data-set-portrait>
      <Boundary label="The portrait try-on">
        <PortraitTryOn model={main.glb} category={main.category} title={title} detachable={main.detachable} wearLabels={main.wearLabels}
          more={others.map(p => ({ model: p.glb, category: p.category }))} />
      </Boundary>
    </div>}
    {wrist.length > 0 && <div className="relative min-h-0 flex-1 border-t border-white/15 landscape:border-l landscape:border-t-0" data-set-hand>
      <Boundary label="The hand try-on">
        <CloneTryOn key={wrist[onWrist].code} model={wrist[onWrist].glb} category={wrist[onWrist].category} />
      </Boundary>
      {wrist.length > 1 && <div className="absolute left-3 top-3 z-20 flex max-w-[55%] flex-wrap gap-2">
        {wrist.map((p, i) => <button key={p.code} type="button" aria-pressed={onWrist === i} onClick={() => setOnWrist(i)} className="ames-pill min-h-9 rounded-full px-3 text-[11px]">{p.name}</button>)}
      </div>}
    </div>}
    <button type="button" onClick={onClose} aria-label="Close the set try-on" className="absolute left-3 top-3 z-30 flex h-11 w-11 items-center justify-center rounded-full shadow-lg" style={bubble}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
  </div>;
}
