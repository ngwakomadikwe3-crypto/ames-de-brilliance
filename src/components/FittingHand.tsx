'use client';
// "Try on my hand": the piece on the customer's own 3D hand (scanned from a photo, or a standard hand until then),
// moved live by their real hand through the camera. The live camera overlay (AR) is offered as an alternative.
import dynamic from 'next/dynamic';
import { Component, useState, type ReactNode } from 'react';
const CloneTryOn = dynamic(() => import('./CloneTryOn'), { ssr: false });
const ArTryOn = dynamic(() => import('./ArTryOn'), { ssr: false });
class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }; static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <p role="status">Hand preview unavailable on this device. Select Piece only to view the jewellery.</p> : this.props.children; }
}
export default function FittingHand({ category, model, children }: { category: string; model: string; children: ReactNode }) {
  const [on, setOn] = useState(false), [ar, setAr] = useState(false);
  if (!['ring', 'bracelet', 'watch'].includes(category) || !model) return <>{children}</>;
  return <div className={on ? 'flex min-h-full flex-col' : 'flex h-full flex-col'} data-try-on={on ? '' : undefined}>
    {/* While trying on, the stage grows to fit the hand view and its controls. */}
    <style>{'.ames-jewelry-stage:has([data-try-on]){height:auto!important}'}</style>
    <div className="min-h-0 flex-1">
      {!on ? children : ar
        ? <SceneBoundary key={'ar' + model}><ArTryOn model={model} category={category} onUnavailable={() => setAr(false)} /></SceneBoundary>
        : <SceneBoundary key={'clone' + model}><CloneTryOn model={model} category={category} onLiveCamera={() => setAr(true)} /></SceneBoundary>}
    </div>
    <div className="flex shrink-0 flex-wrap items-center justify-center gap-x-4 text-xs text-white">
      {on && ar && <button className="min-h-10 underline" onClick={() => setAr(false)}>Back to my 3D hand</button>}
      <button className="min-h-10 underline" onClick={() => { setOn(!on); setAr(false); }}>{on ? 'Piece only' : 'Try on my hand'}</button>
    </div>
  </div>;
}
