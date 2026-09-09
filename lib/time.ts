// ============================================================
// TIME — every timestamp in this platform is UTC in storage and
// converted only at render.
//
// Rules that prevent permanent data corruption:
//   * NEVER store local time. Storing local time makes historical records
//     un-interpretable once the user changes zone or DST shifts.
//   * Use IANA zone names ("Africa/Lagos"), never fixed offsets. A fixed
//     +01:00 silently breaks twice a year.
//   * Default to the browser's detected zone rather than forcing a choice
//     from a 400-item list before the user sees anything.
//   * The FX trading day rolls at 17:00 New York, NOT local midnight. A
//     "daily" recap keyed to Lagos midnight would split sessions wrongly.
// ============================================================

export const COMMON_ZONES = [
  'Africa/Lagos', 'Europe/London', 'Europe/Zurich', 'America/New_York',
  'America/Chicago', 'America/Los_Angeles', 'Asia/Tokyo', 'Asia/Singapore',
  'Asia/Dubai', 'Australia/Sydney', 'UTC',
] as const;

/** The browser's IANA zone, or UTC when unavailable (SSR/older engines). */
export function detectZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function isValidZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Short zone abbreviation, e.g. "WAT", "GMT+1". */
export function zoneAbbr(tz: string, at: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, timeZoneName: 'short',
    }).formatToParts(at);
    return parts.find(p => p.type === 'timeZoneName')?.value ?? tz;
  } catch {
    return tz;
  }
}

/** Current UTC offset in minutes for a zone (DST-correct). */
export function zoneOffsetMinutes(tz: string, at: Date = new Date()): number {
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    const p = Object.fromEntries(dtf.formatToParts(at).map(x => [x.type, x.value]));
    const asUTC = Date.UTC(
      Number(p.year), Number(p.month) - 1, Number(p.day),
      Number(p.hour === '24' ? '00' : p.hour), Number(p.minute), Number(p.second)
    );
    return Math.round((asUTC - at.getTime()) / 60000);
  } catch {
    return 0;
  }
}

export function fmtTime(isoStr: string, tz: string, withSeconds = false): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, hour: '2-digit', minute: '2-digit',
      ...(withSeconds ? { second: '2-digit' } : {}), hour12: false,
    }).format(new Date(isoStr));
  } catch {
    return '—';
  }
}

export function fmtDate(isoStr: string, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, day: '2-digit', month: 'short', year: 'numeric',
    }).format(new Date(isoStr));
  } catch {
    return '—';
  }
}

export function fmtDateTime(isoStr: string, tz: string): string {
  const d = fmtDate(isoStr, tz);
  const t = fmtTime(isoStr, tz);
  return d === '—' ? '—' : `${d} ${t}`;
}

/** Compact relative age, e.g. "4m ago", "2h ago". */
export function ago(isoStr: string, now: number = Date.now()): string {
  const t = new Date(isoStr).getTime();
  if (!Number.isFinite(t)) return '—';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/**
 * Start of the current FX trading day (17:00 America/New_York) as UTC ms.
 * Used for "today so far" recaps so sessions are not split incorrectly.
 */
export function fxDayStart(at: Date = new Date()): number {
  const nyOffset = zoneOffsetMinutes('America/New_York', at);
  const nyNow = new Date(at.getTime() + nyOffset * 60000);
  const roll = new Date(nyNow);
  roll.setUTCHours(17, 0, 0, 0);
  if (nyNow.getTime() < roll.getTime()) roll.setUTCDate(roll.getUTCDate() - 1);
  return roll.getTime() - nyOffset * 60000;
}

/** Start of the current FX trading week (Sunday 17:00 New York) as UTC ms. */
export function fxWeekStart(at: Date = new Date()): number {
  let d = fxDayStart(at);
  for (let i = 0; i < 8; i++) {
    const day = new Date(d).getUTCDay();
    if (day === 0) return d;          // Sunday roll = week open
    d -= 86400000;
  }
  return d;
}
