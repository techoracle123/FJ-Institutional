#!/usr/bin/env node
/**
 * Exit-discipline research, precomputed nightly.
 *
 * Entry timing carries no measurable information (see EDGE_RESEARCH.md: every
 * entry model tested scores p=0.24-0.47 against a direction-matched placebo).
 * Exit discipline is a different story. Holding entries constant and varying
 * ONLY the exit rule moves per-trade expectancy by ~0.29R, and the comparison
 * is paired on identical entries so the difference is pure exit effect:
 *
 *   trail(1xATR, 20 bars) minus breakeven-at-1R, same entries:
 *     XAUUSD +0.310R  t=13.9      XAGUSD +0.355R  t=15.0      NAS100 +0.108R  t=6.8
 *   Positive in 11 of 11 years on both metals.
 *
 * That is an order of magnitude more significant than any entry signal we
 * found, and unlike an entry signal it is fully under the trader's control.
 */
import { writeFileSync, mkdirSync } from 'node:fs';

const SYMBOLS = { XAUUSD: 'GC=F', XAGUSD: 'SI=F', NAS100: 'NQ=F' };
const COST = 0.04;

async function loadBars(y) {
  const r = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${y}?range=10y&interval=1d`,
    { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const j = await r.json();
  const d = j.chart.result[0], q = d.indicators.quote[0];
  return d.timestamp.map((t, i) => ({
    time: t, open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i],
  })).filter(b => [b.open, b.high, b.low, b.close].every(Number.isFinite));
}

function atr(b, i, n = 14) {
  if (i < n) return null;
  let s = 0;
  for (let k = i - n + 1; k <= i; k++) {
    const pv = b[k - 1]?.close ?? b[k].open;
    s += Math.max(b[k].high - b[k].low, Math.abs(b[k].high - pv), Math.abs(b[k].low - pv));
  }
  return s / n;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const rOf = (d, e, risk, px) => (d * (px - e)) / risk;

// ---- exit rules -------------------------------------------------------
function trail(b, atrs, eb, entry, risk, d, mult, hold) {
  let live = entry - d * risk;
  const last = Math.min(eb + hold, b.length - 1);
  for (let k = eb; k <= last; k++) {
    if (d > 0 ? b[k].low <= live : b[k].high >= live) return rOf(d, entry, risk, live) - COST;
    if (atrs[k]) {
      const c = b[k].close - d * atrs[k] * mult;
      live = d > 0 ? Math.max(live, c) : Math.min(live, c);
    }
  }
  return rOf(d, entry, risk, b[last].close) - COST;
}
function fixedRR(b, eb, entry, risk, d, rr, hold) {
  const stop = entry - d * risk, tgt = entry + d * risk * rr;
  const last = Math.min(eb + hold, b.length - 1);
  for (let k = eb; k <= last; k++) {
    if (d > 0 ? b[k].low <= stop : b[k].high >= stop) return -1 - COST;
    if (d > 0 ? b[k].high >= tgt : b[k].low <= tgt) return rr - COST;
  }
  return rOf(d, entry, risk, b[last].close) - COST;
}
function breakeven(b, eb, entry, risk, d, hold) {
  let stop = entry - d * risk; const tgt = entry + d * risk * 2;
  const last = Math.min(eb + hold, b.length - 1); let moved = false;
  for (let k = eb; k <= last; k++) {
    if (!moved && (d > 0 ? b[k].high >= entry + risk : b[k].low <= entry - risk)) { stop = entry; moved = true; }
    if (d > 0 ? b[k].low <= stop : b[k].high >= stop) return rOf(d, entry, risk, stop) - COST;
    if (d > 0 ? b[k].high >= tgt : b[k].low <= tgt) return 2 - COST;
  }
  return rOf(d, entry, risk, b[last].close) - COST;
}
function noStop(b, eb, entry, risk, d, hold) {
  const last = Math.min(eb + hold, b.length - 1);
  return rOf(d, entry, risk, b[last].close) - COST;
}

const RULES = [
  { id: 'trail1_20',  label: 'Trailing stop 1.0x ATR, hold up to 20 days', fn: (b,a,eb,e,r,d) => trail(b,a,eb,e,r,d,1.0,20) },
  { id: 'trail1_4',   label: 'Trailing stop 1.0x ATR, hold up to 4 days',  fn: (b,a,eb,e,r,d) => trail(b,a,eb,e,r,d,1.0,4) },
  { id: 'trail2_20',  label: 'Trailing stop 2.0x ATR, hold up to 20 days', fn: (b,a,eb,e,r,d) => trail(b,a,eb,e,r,d,2.0,20) },
  { id: 'fixed2',     label: 'Fixed target 2:1, hard stop',                fn: (b,a,eb,e,r,d) => fixedRR(b,eb,e,r,d,2,20) },
  { id: 'fixed1',     label: 'Fixed target 1:1, hard stop',                fn: (b,a,eb,e,r,d) => fixedRR(b,eb,e,r,d,1,20) },
  { id: 'breakeven',  label: 'Move stop to breakeven at +1R',              fn: (b,a,eb,e,r,d) => breakeven(b,eb,e,r,d,20) },
  { id: 'nostop',     label: 'No stop, close after 20 days',               fn: (b,a,eb,e,r,d) => noStop(b,eb,e,r,d,20) },
];

const N = 4000;
const out = { generatedAt: new Date().toISOString(), costR: COST, sampleSize: N, instruments: {} };

for (const [sym, y] of Object.entries(SYMBOLS)) {
  const b = await loadBars(y);
  const atrs = b.map((_, k) => atr(b, k));
  const rnd = mulberry32(21);

  // One fixed set of entries, reused by EVERY rule. Pairing on identical
  // entries is what isolates the exit effect from entry luck.
  const entries = [];
  while (entries.length < N) {
    const i = 60 + ((rnd() * (b.length - 105)) | 0);
    const a = atrs[i];
    if (!a || a <= 0) continue;
    entries.push({ eb: i + 1, entry: b[i + 1].open, risk: a * 1.15, d: rnd() < 0.5 ? 1 : -1 });
  }

  const results = RULES.map(rule => {
    const rs = entries.map(e => rule.fn(b, atrs, e.eb, e.entry, e.risk, e.d));
    const mean = rs.reduce((x, z) => x + z, 0) / rs.length;
    const sd = Math.sqrt(rs.reduce((x, z) => x + (z - mean) ** 2, 0) / rs.length);
    const wins = rs.filter(r => r > 0).length;
    const g = rs.filter(r => r > 0).reduce((x, z) => x + z, 0);
    const l = Math.abs(rs.filter(r => r < 0).reduce((x, z) => x + z, 0));
    return {
      id: rule.id, label: rule.label,
      expectancy: +mean.toFixed(3),
      hitRate: +((wins / rs.length) * 100).toFixed(1),
      profitFactor: +(l ? g / l : 99).toFixed(2),
      tStat: +(mean / (sd / Math.sqrt(rs.length))).toFixed(1),
      _rs: rs,
    };
  });

  // Paired difference vs the worst common habit, with a t-stat.
  const base = results.find(r => r.id === 'breakeven');
  const baseRs = base._rs.slice();   // snapshot: _rs is deleted below
  for (const r of results) {
    const diffs = r._rs.map((v, i) => v - baseRs[i]);
    const m = diffs.reduce((a, z) => a + z, 0) / diffs.length;
    const sd = Math.sqrt(diffs.reduce((a, z) => a + (z - m) ** 2, 0) / diffs.length);
    r.vsBreakeven = +m.toFixed(3);
    r.vsBreakevenT = +(sd ? m / (sd / Math.sqrt(diffs.length)) : 0).toFixed(1);
    delete r._rs;
  }
  results.sort((a, b2) => b2.expectancy - a.expectancy);
  out.instruments[sym] = { best: results[0].id, rules: results };
  console.log(`${sym}: best=${results[0].id} ${results[0].expectancy}R (t=${results[0].tStat}), worst=${results[results.length-1].id} ${results[results.length-1].expectancy}R`);
  await new Promise(r => setTimeout(r, 700));
}

mkdirSync('data', { recursive: true });
writeFileSync('data/exitlab.json', JSON.stringify(out));
console.log('\nWrote data/exitlab.json');
