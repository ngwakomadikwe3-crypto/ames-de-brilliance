export type CustomerPreferences = { displayName: string; haptics: boolean };
export const PREFERENCES_KEY = 'ames_customer_preferences_v1';
const changedEvent = 'ames:preferences-changed';
export function normalizeDisplayName(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
}
export function readCustomerPreferences(): CustomerPreferences {
  try {
    const raw = localStorage.getItem(PREFERENCES_KEY);
    if (raw) {
      const value = JSON.parse(raw);
      if (typeof value.displayName === 'string' && typeof value.haptics === 'boolean') {
        return { displayName: normalizeDisplayName(value.displayName), haptics: value.haptics };
      }
    }
    return { displayName: normalizeDisplayName(localStorage.getItem('ames_display_name') || ''), haptics: localStorage.getItem('ames_haptics') !== 'off' };
  } catch { return { displayName: '', haptics: true }; }
}
export function saveCustomerPreferences(preferences: CustomerPreferences): CustomerPreferences {
  const saved = { displayName: normalizeDisplayName(preferences.displayName), haptics: !!preferences.haptics };
  // One write prevents a partially saved name/haptics pair when storage fails.
  localStorage.setItem(PREFERENCES_KEY, JSON.stringify(saved));
  window.dispatchEvent(new Event(changedEvent));
  return saved;
}
export function subscribeCustomerPreferences(notify: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || [PREFERENCES_KEY, 'ames_display_name', 'ames_haptics'].includes(event.key)) notify();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(changedEvent, notify);
  return () => { window.removeEventListener('storage', onStorage); window.removeEventListener(changedEvent, notify); };
}
export function hapticTap() {
  if (typeof navigator === 'undefined' || !readCustomerPreferences().haptics) return;
  try { navigator.vibrate?.(8); } catch { /* Unsupported device: leave the interaction unaffected. */ }
}
export const readCustomerDisplayName = () => readCustomerPreferences().displayName;
export const readCustomerHaptics = () => readCustomerPreferences().haptics;
