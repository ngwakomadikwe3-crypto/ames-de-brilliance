"use client";

import { useEffect, useRef, useState, type RefObject } from 'react';

const THRESHOLD = 72;
const MAX_PULL = 120;
// Gestures that start on a 3D object, a field, a page corner or an open dialog keep their own meaning.
const IGNORED = 'canvas, model-viewer, [data-ames-engine-host], input, textarea, select, [contenteditable="true"], .ames-curl-corner, [role="dialog"], [aria-modal="true"]';

function scrolledAncestor(start: Element, page: Element) {
  for (let node: Element | null = start; node && node !== page.parentElement; node = node.parentElement) {
    if (node.scrollTop > 0) return node;
  }
  return null;
}

/** Touch pull-down on the visible page that asks that page to reload its content. */
export default function PullToRefresh({ rootRef, disabled = false, onRefresh }: { rootRef: RefObject<HTMLElement | null>; disabled?: boolean; onRefresh: () => void }) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const gesture = useRef<{ x: number; y: number; active: boolean } | null>(null);
  const distance = useRef(0);
  const busy = useRef(false);
  const latest = useRef({ disabled, onRefresh });
  useEffect(() => { latest.current = { disabled, onRefresh }; });

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let timer = 0;
    const reset = () => { gesture.current = null; distance.current = 0; setPull(0); };
    const start = (event: TouchEvent) => {
      gesture.current = null;
      if (latest.current.disabled || busy.current || event.touches.length !== 1) return;
      const target = event.target instanceof Element ? event.target : null;
      const page = target?.closest('[data-panel]:not([hidden])');
      if (!target || !page || target.closest(IGNORED) || scrolledAncestor(target, page)) return;
      gesture.current = { x: event.touches[0].clientX, y: event.touches[0].clientY, active: false };
    };
    const move = (event: TouchEvent) => {
      const current = gesture.current;
      if (!current || event.touches.length !== 1) return;
      const dy = event.touches[0].clientY - current.y;
      const dx = event.touches[0].clientX - current.x;
      if (!current.active) {
        if (dy < -6 || Math.abs(dx) > 14) { gesture.current = null; return; }
        if (dy < 12 || Math.abs(dx) > dy) return;
        current.active = true;
      }
      distance.current = Math.max(0, Math.min(MAX_PULL, (dy - 12) * 0.55));
      setPull(distance.current);
    };
    const end = () => {
      const current = gesture.current;
      if (!current?.active) { gesture.current = null; return; }
      if (distance.current < THRESHOLD) { reset(); return; }
      gesture.current = null;
      busy.current = true;
      setRefreshing(true);
      setPull(THRESHOLD);
      latest.current.onRefresh();
      timer = window.setTimeout(() => { busy.current = false; setRefreshing(false); reset(); }, 1100);
    };
    root.addEventListener('touchstart', start, { passive: true });
    root.addEventListener('touchmove', move, { passive: true });
    root.addEventListener('touchend', end, { passive: true });
    root.addEventListener('touchcancel', reset, { passive: true });
    return () => {
      window.clearTimeout(timer);
      root.removeEventListener('touchstart', start);
      root.removeEventListener('touchmove', move);
      root.removeEventListener('touchend', end);
      root.removeEventListener('touchcancel', reset);
    };
  }, [rootRef]);

  const ready = pull >= THRESHOLD;
  const visible = pull > 4 || refreshing;
  return (
    <div className="ames-pull-indicator" data-pull-state={refreshing ? 'refreshing' : ready ? 'ready' : visible ? 'pulling' : 'idle'} aria-hidden={!visible}
      style={{ opacity: visible ? Math.min(1, pull / THRESHOLD + (refreshing ? 1 : 0)) : 0, transform: `translate(-50%, ${Math.min(pull, THRESHOLD) * 0.6}px)` }}>
      <span className="ames-pill ames-pull-pill">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
          className={refreshing ? 'ames-pull-spin' : undefined} style={{ transform: refreshing ? undefined : `rotate(${ready ? 180 : Math.round(pull / THRESHOLD * 180)}deg)`, transition: 'transform 120ms ease' }}>
          {refreshing ? <path d="M21 12a9 9 0 1 1-3-6.7M21 4v5h-5" /> : <path d="M12 5v14M6 13l6 6 6-6" />}
        </svg>
        <span role="status">{refreshing ? 'Refreshing…' : ready ? 'Release to refresh' : visible ? 'Pull to refresh' : ''}</span>
      </span>
    </div>
  );
}
