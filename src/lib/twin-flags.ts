// Feature flags for the twins. Every new system ships behind one, with the current twin as the fallback: a flag can be
// turned off per device (localStorage 'ames-flags': {"live-mirror": false}) or per visit (?flags=-live-mirror,+x).
export type TwinFlag = 'live-mirror' | 'face-refine' | 'expression-skin' | 'room-light';
const DEFAULTS: Record<TwinFlag, boolean> = { 'live-mirror': true, 'face-refine': true, 'expression-skin': true, 'room-light': false };
export function flag(name: TwinFlag): boolean {
  if (typeof window === 'undefined') return DEFAULTS[name];
  try {
    const q = new URLSearchParams(location.search).get('flags')?.split(',') ?? [];
    if (q.includes('-' + name)) return false;
    if (q.includes('+' + name) || q.includes(name)) return true;
    const stored = JSON.parse(localStorage.getItem('ames-flags') ?? '{}') as Partial<Record<TwinFlag, boolean>>;
    return stored[name] ?? DEFAULTS[name];
  } catch { return DEFAULTS[name]; }
}
