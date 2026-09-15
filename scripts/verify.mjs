#!/usr/bin/env node
/**
 * Precompute strategy verification into data/verification.json.
 *
 * Running 10k bootstrap resamples + 400 placebo replications per instrument
 * inside the Worker cost ~11M operations per request and blew the 10ms CPU
 * limit, which surfaced as intermittent 503s across the whole site. The stats
 * only change when the bar data changes, so they belong in a nightly job.
 */
import { writeFileSync, mkdirSync } from 'node:fs';

const SYMBOLS = { XAUUSD: 'GC=F', XAGUSD: 'SI=F', NAS100: 'NQ=F' };

async function bars(yahoo) {
  const u = `https://query1.finance.yahoo.com/v8/finance/chart/${yahoo}?range=5y&interval=1d`;
  const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const j = await r.json();
  const d = j.chart.result[0], q = d.indicators.quote[0];
  return d.timestamp.map((t, i) => ({
    time: t, open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i],
  })).filter(b => [b.open, b.high, b.low, b.close].every(Number.isFinite));
}

const sma = (a, i, n) => i + 1 < n ? null : a.slice(i - n + 1, i + 1).reduce((x, y) => x + y, 0) / n;
function atr(b, i, n = 14) {
  if (i < n) return null;
  let s = 0;
  for (let k = i - n + 1; k <= i; k++) {
    const pv = b[k - 1]?.close ?? b[k].open;
    s += Math.max(b[k].high - b[k].low, Math.abs(b[k].high - pv), Math.abs(b[k].low - pv));
  }
  return s / n;
}
function rsi(c, i, n = 14) {
  if (i < n) return null;
  let g = 0, l = 0;
  for (let k = i - n + 1; k <= i; k++) { const d = c[k] - c[k - 1]; if (d >= 0) g += d; else l -= d; }
  return g + l === 0 ? 50 : 100 - 100 / (1 + (g / n) / ((l / n) || 1e-9));
}
function signal(b, c, i) {
  const f = sma(c, i, 20), s = sma(c, i, 50), r = rsi(c, i);
  if (f == null || s == null || r == null) return null;
  let sc = 0;
  const sp = (f - s) / s;
  if (Math.abs(sp) > 0.0015) sc += Math.max(-1.6, Math.min(1.6, sp * 220));
  const mv = Math.max(-1.1, Math.min(1.1, ((c[i] - c[i - 5]) / c[i - 5]) * 90));
  if (Math.abs(mv) > 0.25) sc += mv;
  if (r > 72) sc -= 0.85; else if (r < 28) sc += 0.85;
  return sc;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function exitTrade(b, atrs, i, d, stopAtr, maxHold, trail, costR) {
  const a = atrs[i]; if (!a) return null;
  const eb = i + 1; if (eb >= b.length) return null;
  const entry = b[eb].open, risk = a * stopAtr;
  if (!(risk > 0)) return null;
  let live = entry - d * risk;
  const last = Math.min(eb + maxHold, b.length - 1);
  let ex = b[last].close, held = maxHold;
  for (let k = eb; k <= last; k++) {
    if (d > 0 ? b[k].low <= live : b[k].high >= live) { ex = live; held = k - eb; break; }
    if (atrs[k]) {
      const cand = b[k].close - d * atrs[k] * trail;
      live = d > 0 ? Math.max(live, cand) : Math.min(live, cand);
    }
  }
  return { r: (d * (ex - entry)) / risk - costR, held };
}

const STOP = 1.15, HOLD = 4, TRAIL = 1.0;

function strategy(b, costR) {
  const c = b.map(x => x.close);
  const atrs = b.map((_, k) => atr(b, k));
  const out = []; let i = 55;
  while (i < b.length - 1) {
    const sc = signal(b, c, i);
    if (sc == null || Math.abs(sc) < 0.42 || !atrs[i]) { i++; continue; }
    const d = sc > 0 ? 1 : -1;
    const t = exitTrade(b, atrs, i, d, STOP, HOLD, TRAIL, costR);
    if (!t) { i++; continue; }
    out.push({ r: t.r, d });
    i = i + 1 + Math.max(t.held, 1);
  }
  return out;
}

function verify(b, trades, costR) {
  const rs = trades.map(t => t.r), n = rs.length;
  if (n < 30) return { n, verified: false, verdict: 'Insufficient sample.' };
  const exp = rs.reduce((a, x) => a + x, 0) / n;
  const rnd = mulberry32(42), means = [];
  for (let z = 0; z < 10000; z++) {
    let s = 0; for (let k = 0; k < n; k++) s += rs[(rnd() * n) | 0];
    means.push(s / n);
  }
  means.sort((x, y) => x - y);
  const ciLow = means[500], ciHigh = means[9500];

  const atrs = b.map((_, k) => atr(b, k));
  const r2 = mulberry32(1234), pm = [];
  for (let rep = 0; rep < 400; rep++) {
    let sum = 0, cnt = 0;
    for (const t of trades) {
      let res = null;
      for (let g = 0; g < 40 && !res; g++) {
        const i = 60 + ((r2() * (b.length - 95)) | 0);
        res = exitTrade(b, atrs, i, t.d, STOP, HOLD, TRAIL, costR);
      }
      if (res) { sum += res.r; cnt++; }
    }
    if (cnt) pm.push(sum / cnt);
  }
  pm.sort((x, y) => x - y);
  const placeboMedian = pm[Math.floor(pm.length / 2)];
  const pValue = pm.filter(m => m >= exp).length / pm.length;
  const verified = pValue < 0.05 && ciLow > 0;
  return {
    n, expectancy: +exp.toFixed(3), ciLow: +ciLow.toFixed(3), ciHigh: +ciHigh.toFixed(3),
    placeboMedian: +placeboMedian.toFixed(3), placeboP95: +pm[Math.floor(0.95 * pm.length)].toFixed(3),
    pValue: +pValue.toFixed(3), verified,
    verdict: verified
      ? 'Verified: expectancy floor above zero and beats a direction-matched placebo.'
      : ciLow <= 0 && pValue >= 0.05
        ? `Not verified: CI-low ${ciLow.toFixed(3)}R and indistinguishable from random entry (p=${pValue.toFixed(3)}).`
        : ciLow <= 0
          ? `Not verified: bootstrap floor ${ciLow.toFixed(3)}R does not exclude zero.`
          : `Not verified: random entry timing matches this result (p=${pValue.toFixed(3)}) — the exit is doing the work, not the signal.`,
  };
}

const out = { generatedAt: new Date().toISOString(), instruments: {} };
for (const [sym, y] of Object.entries(SYMBOLS)) {
  const b = await bars(y);
  const costR = 0.03;
  const tr = strategy(b, costR);
  const v = verify(b, tr, costR);
  out.instruments[sym] = v;
  console.log(`${sym}: n=${v.n} exp=${v.expectancy} CI=[${v.ciLow},${v.ciHigh}] placebo=${v.placeboMedian} p=${v.pValue} verified=${v.verified}`);
  await new Promise(r => setTimeout(r, 800));
}
out.anyVerified = Object.values(out.instruments).some(v => v.verified);
mkdirSync('data', { recursive: true });
writeFileSync('data/verification.json', JSON.stringify(out, null, 0));
console.log(`\nWrote data/verification.json — anyVerified=${out.anyVerified}`);
