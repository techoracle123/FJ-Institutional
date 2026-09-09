#!/usr/bin/env node
/**
 * Mirror every FRED series the app needs into data/fred.json.
 *
 * Why this exists: FRED's Akamai WAF returns 403 for a subset of Cloudflare
 * edge IPs. It is per-colo, not per-request, so retries inside the Worker do
 * not help — measured ~50% of /api/state calls lost the entire macro block,
 * dropping dataConfidence to 25 and suppressing every thesis. GitHub Actions
 * runners are not blocked, so we snapshot here and the Worker reads the repo.
 */
import { writeFileSync, mkdirSync } from 'node:fs';

const KEY = process.env.FRED_API_KEY;
if (!KEY) { console.error('FRED_API_KEY missing'); process.exit(1); }

const SERIES = [
  'DGS2','DGS10','DGS30','DFII10','DFII5','T10YIE','T10Y2Y',
  'BAMLH0A0HYM2','BAMLC0A0CM','VIXCLS','DTWEXBGS','DFF','SOFR',
  'WALCL','WTREGEN','RRPONTSYD',
];
const LIMIT = 260;

async function pull(id) {
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${id}`
    + `&api_key=${KEY}&file_type=json&limit=${LIMIT}&sort_order=desc`;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const r = await fetch(url);
      if (r.ok) {
        const j = await r.json();
        const obs = (j.observations ?? [])
          .filter(o => o.value !== '.' && o.value !== '')
          .map(o => ({ date: o.date, value: parseFloat(o.value) }))
          .filter(o => Number.isFinite(o.value));
        if (obs.length) return obs;
      }
      console.warn(`  ${id}: HTTP ${r.status} (attempt ${attempt})`);
    } catch (e) {
      console.warn(`  ${id}: ${e.message} (attempt ${attempt})`);
    }
    await new Promise(r => setTimeout(r, 800 * attempt));
  }
  return null;
}

const out = { updatedAt: new Date().toISOString(), limit: LIMIT, series: {} };
let failed = 0;
for (const id of SERIES) {
  const obs = await pull(id);
  if (obs) { out.series[id] = obs; console.log(`  ${id}: ${obs.length} obs, latest ${obs[0].date}=${obs[0].value}`); }
  else { failed++; console.error(`  ${id}: FAILED`); }
  await new Promise(r => setTimeout(r, 150));
}

// Never publish a gutted mirror over a good one.
if (failed > SERIES.length / 3) {
  console.error(`Too many failures (${failed}/${SERIES.length}) — refusing to write.`);
  process.exit(1);
}

mkdirSync('data', { recursive: true });
writeFileSync('data/fred.json', JSON.stringify(out));
console.log(`Wrote data/fred.json — ${Object.keys(out.series).length}/${SERIES.length} series, ${failed} failed.`);
