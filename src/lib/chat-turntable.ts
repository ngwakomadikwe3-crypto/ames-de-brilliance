export const TURN_DEGREES_PER_SECOND = 4;
export const RESUME_DELAY_MS = 1800;
export const RESUME_RAMP_MS = 1000;

export type TurntableState = {
  angleDeg: number;
  enabled: boolean;
  ready: boolean;
  dragging: boolean;
  resumeAtMs: number;
  lastFrameMs: number | null;
};

export function createTurntable(enabled: boolean): TurntableState {
  return { angleDeg: 0, enabled, ready: false, dragging: false, resumeAtMs: 0, lastFrameMs: null };
}

export function turntableReady(state: TurntableState, now: number): TurntableState {
  return { ...state, ready: true, lastFrameMs: now };
}

export function turntableEnabled(state: TurntableState, enabled: boolean, now: number): TurntableState {
  return { ...state, enabled, lastFrameMs: now, resumeAtMs: enabled ? now : state.resumeAtMs };
}

export function turntablePointerDown(state: TurntableState, now: number): TurntableState {
  return { ...state, dragging: true, lastFrameMs: now };
}

export function turntablePointerUp(state: TurntableState, now: number): TurntableState {
  return { ...state, dragging: false, resumeAtMs: now + RESUME_DELAY_MS, lastFrameMs: now };
}

export function turntableReset(state: TurntableState, now: number): TurntableState {
  return { ...state, angleDeg: 0, lastFrameMs: now, resumeAtMs: now };
}

export function turntableTick(state: TurntableState, now: number): TurntableState {
  const previous = state.lastFrameMs ?? now;
  const elapsedSeconds = Math.max(0, Math.min(0.05, (now - previous) / 1000));
  if (!state.ready || !state.enabled || state.dragging || now < state.resumeAtMs) return { ...state, lastFrameMs: now };
  const ramp = Math.min(1, Math.max(0, (now - state.resumeAtMs) / RESUME_RAMP_MS));
  return { ...state, angleDeg: (state.angleDeg + TURN_DEGREES_PER_SECOND * elapsedSeconds * ramp) % 360, lastFrameMs: now };
}
