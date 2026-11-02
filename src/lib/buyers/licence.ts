/**
 * Licence expiry as a calendar DATE (owner instruction 2026-11-01, item 4).
 *
 * Licence expiry is stored as a strict YYYY-MM-DD calendar date — no
 * timestamps, no time-zone-dependent instants. Expiry is INCLUSIVE of the
 * final day: a licence expiring 2026-06-15 still authorises offers on
 * 2026-06-15 and blocks them from 2026-06-16 onwards. "Today" is always
 * judged in Africa/Gaborone (the house's jurisdiction), so the rule is
 * identical on every server regardless of host time zone. Unparseable or
 * non-calendar values fail CLOSED (treated as expired).
 */

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True only for a real calendar date in strict YYYY-MM-DD form. */
export function isValidLicenceDate(value: string): boolean {
  const match = DATE_ONLY_RE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

const gaboroneCalendar = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Gaborone',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** "Today" in Africa/Gaborone as YYYY-MM-DD (en-CA formats ISO-style). */
export function todayInGaborone(now: Date = new Date()): string {
  return gaboroneCalendar.format(now);
}

/**
 * True when the licence is still usable on the given Gaborone calendar day —
 * the expiry day itself counts (inclusive). Both arguments must be strict
 * YYYY-MM-DD; anything else fails closed.
 */
export function licenceCurrentOn(expiry: string, today: string): boolean {
  if (!isValidLicenceDate(expiry)) return false;
  if (!DATE_ONLY_RE.test(today)) return false;
  // Zero-padded ISO calendar dates compare correctly as strings.
  return expiry >= today;
}
