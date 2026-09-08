/**
 * Fetches the economic calendar and writes data/calendar.json.
 *
 * Runs in GitHub Actions, NOT in the worker: ForexFactory rate-limits
 * Cloudflare's shared egress IPs with HTTP 429, so the edge can never
 * fetch this feed reliably. Actions runners have clean IPs and are free
 * and unlimited on public repos.
 */
import { writeFileSync } from 'node:fs';

const CCY_AFFECTS = {
  USD: ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'XAGUSD', 'NAS100'],
  EUR: ['EURUSD'],
  GBP: ['GBPUSD'],
  JPY: ['USDJPY'],
};

const num = (v) => {
  if (!v) return null;
  const n = parseFloat(String(v).replace(/[%KMBT<>,]/g, ''));
  return Number.isFinite(n) ? n : null;
};

const res = await fetch('https://nfs.faireconomy.media/ff_calendar_thisweek.json', {
  headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FJInstitutional/1.0)' },
});
if (!res.ok) throw new Error(`upstream ${res.status}`);
const raw = await res.json();

const seen = new Set();
const events = raw
  .filter((e) => CCY_AFFECTS[e.country])
  .filter((e) => e.impact === 'High' || e.impact === 'Medium')
  .map((e) => ({
    time: new Date(e.date).toISOString(),
    title: e.title,
    currency: e.country,
    impact: e.impact === 'High' ? 'high' : 'medium',
    consensus: num(e.forecast),
    prior: num(e.previous),
    affects: CCY_AFFECTS[e.country],
  }))
  .filter((e) => Number.isFinite(new Date(e.time).getTime()))
  .filter((e) => {
    const k = e.time + e.title;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  })
  .sort((a, b) => a.time.localeCompare(b.time));

if (!events.length) throw new Error('refusing to write an empty calendar');

writeFileSync(
  'data/calendar.json',
  JSON.stringify({ fetchedAt: new Date().toISOString(), events }, null, 2)
);
console.log(`wrote ${events.length} events`);
