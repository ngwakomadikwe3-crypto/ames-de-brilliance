'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** A studio-rendered 360° turn of a piece: frames photographed in Blender Cycles, played like video. */
export interface SpinManifest {
  /** Number of frames in one full turn. */
  frames: number;
  /** Frame file name with a %03d counter, relative to the manifest folder (e.g. "ring-%03d.webp"). */
  pattern: string;
  /** Pixel size of each square frame. */
  size: number;
  /** Optional sharper set, loaded only when the customer zooms in. */
  detail?: { pattern: string; size: number };
  /** Seconds for one full turn when it plays by itself. */
  turnSeconds?: number;
}

/** Looks for a studio spin beside a piece (/ames-engine/<assetId>/spin/manifest.json). Null while absent. */
export function useSpin(assetId: string) {
  const base = `/ames-engine/${assetId}/spin/`;
  const [found, setFound] = useState<{ base: string; manifest: SpinManifest } | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(base + 'manifest.json').then(r => r.ok ? r.json() : null).then(m => { if (alive && m?.frames) setFound({ base, manifest: m }); }).catch(() => {});
    return () => { alive = false; };
  }, [base]);
  return found?.base === base ? found : null;
}

const frameUrl = (base: string, pattern: string, i: number) => base + pattern.replace('%03d', String(i).padStart(3, '0'));
const MIN_ZOOM = 1, MAX_ZOOM = 4;

/**
 * Plays a spin like footage, one whole photograph at a time. Drag or swipe to turn (it follows the finger and coasts on release), scroll,
 * pinch or use the buttons to zoom, drag to look around while zoomed. It turns slowly by itself until touched, and
 * again a few seconds after the customer lets go; it stays still for visitors who ask for reduced motion.
 */
export default function SpinViewer({ base, manifest, alt, style }: { base: string; manifest: SpinManifest; alt: string; style?: React.CSSProperties }) {
  const host = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const images = useRef<(HTMLImageElement | null)[]>([]), detail = useRef<(HTMLImageElement | null)[]>([]);
  const [loaded, setLoaded] = useState(0), [zoom, setZoomState] = useState(1);
  const view = useRef({ pos: 0, velocity: 0, zoom: 1, panX: 0, panY: 0, dragging: false, lastInput: -1e9 });
  const n = manifest.frames;

  // Load the first frame at once, then the rest in turn order so the spin fills in smoothly.
  useEffect(() => {
    let alive = true; images.current = new Array(n).fill(null); detail.current = new Array(n).fill(null);
    let count = 0;
    const order = Array.from({ length: n }, (_, i) => i);
    const load = (i: number) => new Promise<void>(resolve => {
      const img = new Image(); img.decoding = 'async';
      img.onload = () => { if (alive) { images.current[i] = img; count += 1; setLoaded(count); } resolve(); };
      img.onerror = () => resolve();
      img.src = frameUrl(base, manifest.pattern, i);
    });
    (async () => { await load(0); for (let k = 0; k < 4 && alive; k++) await Promise.all(order.filter(i => i && i % 4 === k).map(load)); })();
    return () => { alive = false; };
  }, [base, manifest.pattern, n]);

  // The sharper set is fetched only once someone zooms in.
  useEffect(() => {
    if (zoom <= 1.25 || !manifest.detail) return;
    let alive = true;
    const at = Math.round(((view.current.pos % n) + n) % n) % n;
    const order = Array.from({ length: n }, (_, k) => (at + (k % 2 ? -1 : 1) * Math.ceil(k / 2) + n) % n);
    (async () => {
      for (const i of order) {
        if (!alive) return;
        if (detail.current[i]) continue;
        await new Promise<void>(resolve => {
          const img = new Image(); img.decoding = 'async';
          img.onload = () => { if (alive) detail.current[i] = img; resolve(); }; img.onerror = () => resolve();
          img.src = frameUrl(base, manifest.detail!.pattern, i);
        });
      }
    })();
    return () => { alive = false; };
  }, [zoom > 1.25, base, manifest.detail, n]); // eslint-disable-line react-hooks/exhaustive-deps

  const setZoom = useCallback((value: number) => {
    const v = view.current; v.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
    if (v.zoom === 1) { v.panX = 0; v.panY = 0; }
    v.lastInput = performance.now(); setZoomState(v.zoom);
  }, []);

  // Drawing and motion.
  useEffect(() => {
    const c = canvas.current!, ctx = c.getContext('2d')!;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const perSecond = n / (manifest.turnSeconds ?? 14);
    let frame = 0, last = performance.now();
    const nearest = (i: number) => {
      const set = view.current.zoom > 1.25 ? detail.current : null;
      if (set?.[i]) return set[i];
      if (images.current[i]) return images.current[i];
      for (let d = 1; d < n; d++) { const a = images.current[(i + d) % n] ?? images.current[(i - d + n) % n]; if (a) return a; }
      return null;
    };
    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      const dt = Math.min(.05, (now - last) / 1000); last = now;
      const v = view.current;
      if (!v.dragging) {
        if (Math.abs(v.velocity) > .05) { v.pos += v.velocity * dt; v.velocity *= Math.pow(.04, dt); }
        else if (!reduced && v.zoom === 1 && now - v.lastInput > 3500) v.pos += perSecond * dt;
      }
      const ratio = Math.min(window.devicePixelRatio || 1, 2), w = c.clientWidth, h = c.clientHeight;
      if (c.width !== Math.round(w * ratio) || c.height !== Math.round(h * ratio)) { c.width = Math.round(w * ratio); c.height = Math.round(h * ratio); }
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height);
      // Show the nearest photograph, whole: blending two angles ghosts every edge into a double image.
      const p = ((v.pos % n) + n) % n, i = Math.round(p) % n;
      const a = nearest(i);
      if (!a) return;
      const side = Math.min(c.width, c.height) * v.zoom;
      const x = (c.width - side) / 2 + v.panX * ratio, y = (c.height - side) / 2 + v.panY * ratio;
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.globalAlpha = 1; ctx.drawImage(a, x, y, side, side);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [n, manifest.turnSeconds]);

  // Pointer input: one finger turns (or pans when zoomed), two fingers pinch, the wheel zooms.
  useEffect(() => {
    const el = host.current!, pointers = new Map<number, { x: number; y: number }>();
    let lastX = 0, lastY = 0, lastT = 0, pinch = 0, pinchZoom = 1;
    const v = view.current;
    const framesPerPixel = () => n / Math.max(320, el.clientWidth * 1.4);
    const down = (e: PointerEvent) => {
      el.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      v.dragging = true; v.velocity = 0; v.lastInput = performance.now(); lastX = e.clientX; lastY = e.clientY; lastT = performance.now();
      if (pointers.size === 2) { const [p, q] = [...pointers.values()]; pinch = Math.hypot(p.x - q.x, p.y - q.y); pinchZoom = v.zoom; }
    };
    const move = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const now = performance.now(); v.lastInput = now;
      if (pointers.size === 2) { const [p, q] = [...pointers.values()]; const d = Math.hypot(p.x - q.x, p.y - q.y); if (pinch) setZoom(pinchZoom * d / pinch); return; }
      const dx = e.clientX - lastX, dy = e.clientY - lastY, dt = Math.max(1, now - lastT) / 1000;
      if (v.zoom > 1) {
        const limit = (el.clientWidth * (v.zoom - 1)) / 2;
        v.panX = Math.max(-limit, Math.min(limit, v.panX + dx)); v.panY = Math.max(-limit, Math.min(limit, v.panY + dy));
      } else {
        // Dragging right turns the near side of the piece to the right, like turning it in the hand.
        const step = -dx * framesPerPixel(); v.pos += step; v.velocity = step / dt;
      }
      lastX = e.clientX; lastY = e.clientY; lastT = now;
    };
    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId); if (pointers.size < 2) pinch = 0;
      if (pointers.size === 0) { v.dragging = false; if (performance.now() - lastT > 80) v.velocity = 0; v.lastInput = performance.now(); }
    };
    const wheel = (e: WheelEvent) => { e.preventDefault(); setZoom(v.zoom * Math.exp(-e.deltaY * .0015)); };
    el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('wheel', wheel, { passive: false });
    return () => { el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); el.removeEventListener('wheel', wheel); };
  }, [n, setZoom]);

  return (
    <div ref={host} className="ames-spin" data-spin-viewer data-spin-zoomed={zoom > 1 ? "true" : undefined} data-spin-loaded={loaded} data-spin-frames={n} role="img" aria-label={`${alt}: 360° studio view. Drag to turn, pinch or scroll to zoom.`}
      style={{ position: 'relative', width: '100%', height: '100%', touchAction: 'none', cursor: 'grab', userSelect: 'none', ...style }}>
      <canvas ref={canvas} className="ames-feathered-stage" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
      {loaded < n && <span role="status" className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-[#031815]/80 px-3 py-1 text-[11px] text-white">Loading studio spin · {Math.round(loaded / n * 100)}%</span>}
      <div className="absolute right-3 top-3 z-20 flex gap-2" role="group" aria-label="Zoom">
        <button type="button" aria-label="Zoom out" disabled={zoom <= MIN_ZOOM} onClick={() => setZoom(zoom / 1.4)} className="ames-pill min-h-11 min-w-11 rounded-full px-3 disabled:opacity-40">−</button>
        <button type="button" aria-label="Zoom in" disabled={zoom >= MAX_ZOOM} onClick={() => setZoom(zoom * 1.4)} className="ames-pill min-h-11 min-w-11 rounded-full px-3 disabled:opacity-40">+</button>
      </div>
    </div>
  );
}
