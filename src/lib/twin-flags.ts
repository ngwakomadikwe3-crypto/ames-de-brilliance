// Feature flags for the twins. Every new system ships behind one, with the current twin as the fallback: a flag can be
// turned off per device (localStorage 'ames-flags': {"live-mirror": false}) or per visit (?flags=-live-mirror,+x).
export type TwinFlag = 'live-mirror' | 'face-refine' | 'expression-skin' | 'room-light' | 'skin-v2';
// face-refine is off: on renders read by the real detector it did not tighten the silhouette (docs/portrait-twin.md)
const DEFAULTS: Record<TwinFlag, boolean> = { 'live-mirror': true, 'face-refine': false, 'expression-skin': true, 'room-light': true, 'skin-v2': false };   // skin-v2: System 2's texture; on only when its four gates pass
export function flag(name: TwinFlag): boolean {
  if (typeof window === 'undefined') return DEFAULTS[name];
  try {
    // (a '+' in a query string arrives as a space: treat ' x' as '+x')
    const q = (new URLSearchParams(location.search).get('flags')?.split(',') ?? []).map(f => f.replace(/^ /, '+').trim());
    if (q.includes('-' + name)) return false;
    if (q.includes('+' + name) || q.includes(name)) return true;
    const stored = JSON.parse(localStorage.getItem('ames-flags') ?? '{}') as Partial<Record<TwinFlag, boolean>>;
    return stored[name] ?? DEFAULTS[name];
  } catch { return DEFAULTS[name]; }
}
