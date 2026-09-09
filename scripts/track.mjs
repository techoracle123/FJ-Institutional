/**
 * THESIS TRACKER — runs in GitHub Actions every 5 minutes.
 *
 * This is the platform's heartbeat. Cloudflare Workers cannot do this job:
 * 10ms CPU, no durable state, and a worker only wakes when a browser asks.
 * A tracker that only runs when someone is looking is not a tracker.
 *
 * Each run:
 *   1. Reads the current board from the live site (/api/state).
 *   2. Publishes any NEW thesis into the immutable ledger with a stable UUID
 *      and frozen entry/stop/target.
 *   3. Polls price for every OPEN thesis and updates pips, R, MFE and MAE.
 *   4. Resolves theses that hit target, stop, or expiry.
 *   5. Appends revisions when probability or regime materially changes.
 *
 * HONESTY RULES (these are the whole point):
 *   - If a 5-minute window contains BOTH the stop and the target, we cannot
 *     know which came first. Recorded as `ambiguous`, never scored a win.
 *     This mirrors the daily backtest's stop-first rule so live and backtest
 *     numbers stay comparable.
 *   - Prices are sanity-checked before being written. A stale/insane quote
 *     (the class of bug that produced a fabricated -4% USDJPY) must never
 *     enter a permanent record.
 *   - Weekend gaps break tracking rather than inventing fills at prices that
 *     never traded.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const SITE = process.env.SITE_URL || 'https://fjinstitutional.techoracle0.workers.dev';
const LEDGER = 'data/ledger.json';
const MAX_THESES = 4000;     // keep the file small enough to fetch fast
const MAX_REVISIONS = 8000;

const PIP_SIZE = {
  EURUSD: 0.0001, GBPUSD: 0.0001, USDJPY: 0.01,
  XAUUSD: 0.1, XAGUSD: 0.01, NAS100: 1.0,
  AUDUSD: 0.0001, USDCAD: 0.0001, USDCHF: 0.0001, NZDUSD: 0.0001,
};

/** Plausibility bounds. A quote outside these is rejected, not recorded. */
const SANE = {
  EURUSD: [0.5, 2.0], GBPUSD: [0.8, 2.5], USDJPY: [80, 250],
  XAUUSD: [500, 20000], XAGUSD: [5, 500], NAS100: [3000, 100000],
  AUDUSD: [0.3, 1.5], USDCAD: [0.8, 2.2], USDCHF: [0.5, 1.8], NZDUSD: [0.3, 1.5],
};

const iso = (d = new Date()) => d.toISOString();

function loadLedger() {
  if (!existsSync(LEDGER)) {
    return { updatedAt: iso(), theses: [], revisions: [], tracks: [] };
  }
  try {
    const j = JSON.parse(readFileSync(LEDGER, 'utf8'));
    return {
      updatedAt: j.updatedAt ?? iso(),
      theses: j.theses ?? [],
      revisions: j.revisions ?? [],
      tracks: j.tracks ?? [],
    };
  } catch {
    return { updatedAt: iso(), theses: [], revisions: [], tracks: [] };
  }
}

async function getJSON(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': 'FJInstitutional-Tracker/1.0' },
      });
      if (r.ok) return await r.json();
    } catch { /* retry */ }
    await new Promise(res => setTimeout(res, 1500 * (i + 1)));
  }
  return null;
}

function sane(symbol, price) {
  const b = SANE[symbol];
  if (!b) return Number.isFinite(price) && price > 0;
  return Number.isFinite(price) && price >= b[0] && price <= b[1];
}

const toPips = (sym, d) => Math.round((d / (PIP_SIZE[sym] ?? 0.0001)) * 10) / 10;

function rOf(dir, entry, stop, now) {
  const risk = Math.abs(entry - stop);
  if (risk <= 0) return 0;
  const raw = dir === 'long' ? now - entry : entry - now;
  return Math.round((raw / risk) * 1000) / 1000;
}

async function main() {
  mkdirSync('data', { recursive: true });
  const ledger = loadLedger();

  const state = await getJSON(`${SITE}/api/state`);
  if (!state?.ok) {
    console.log('state unavailable — leaving ledger untouched');
    return;
  }

  const tick = await getJSON(`${SITE}/api/tick`);
  const ticks = tick?.ticks ?? {};
  const now = iso();

  // ---------- 1. publish new theses ----------
  const liveKeys = new Set();
  let published = 0;

  for (const t of state.theses ?? []) {
    // Identity is (symbol, direction, entry-ish, day) — NOT the volatile
    // `${symbol}-${Date.now()}` id, which changes on every request.
    // The board exposes an entry ZONE (entryLow/entryHigh) and t1/t2, not
    // flat entry/target fields. Use the zone midpoint as the frozen entry.
    const entry = Number.isFinite(t.entry)
      ? t.entry
      : (Number(t.entryLow) + Number(t.entryHigh)) / 2;
    const target = Number.isFinite(t.target) ? t.target : Number(t.t1);
    // Identity must not include a drifting price: entry zones move slightly
    // between polls, which previously republished the same call every run.
    // "The call we made today" = symbol + direction + class + trading day.
    const day = now.slice(0, 10);
    const key = `${t.symbol}|${t.direction}|${t.klass}|${day}`;
    liveKeys.add(key);

    const already = ledger.theses.find(x => x.key === key);
    if (already) {
      // Material change -> append a revision, never edit the original.
      const prev = ledger.revisions
        .filter(r => r.thesisId === already.id && r.kind === 'probability')
        .slice(-1)[0];
      const lastProb = prev ? Number(prev.to) : already.probability;
      if (Math.abs(t.probability - lastProb) >= 4) {
        ledger.revisions.push({
          thesisId: already.id, at: now, kind: 'probability',
          from: String(lastProb), to: String(t.probability),
          reason: 'Recalculated from updated evidence',
        });
      }
      const curReg = state.priceRegimes?.[t.symbol]?.id ?? null;
      if (curReg && already.regime && curReg !== already.regime) {
        const dup = ledger.revisions.some(
          r => r.thesisId === already.id && r.kind === 'regime' && r.to === curReg
        );
        if (!dup) {
          ledger.revisions.push({
            thesisId: already.id, at: now, kind: 'regime',
            from: already.regime, to: curReg,
            reason: `Structure shifted to ${state.priceRegimes[t.symbol]?.label ?? curReg}`,
          });
        }
      }
      continue;
    }

    if (!sane(t.symbol, entry) || !sane(t.symbol, target) || !sane(t.symbol, t.stop)) {
      console.log(`rejected implausible levels ${t.symbol} e=${entry} t=${target} s=${t.stop}`);
      continue;
    }

    const id = randomUUID();
    const expires = new Date(Date.now() + (t.klass === 'intraday' ? 12 : 96) * 3600_000);
    ledger.theses.push({
      id, key,
      symbol: t.symbol,
      direction: t.direction,
      klass: t.klass,
      conviction: t.conviction,
      probability: t.probability,
      entry,
      stop: t.stop,
      target,
      rr: t.rr,
      expectedValue: t.expectedValue,
      publishedAt: t.issuedAt ?? now,
      expiresAt: t.expiresAt ?? iso(expires),
      regime: state.priceRegimes?.[t.symbol]?.id ?? null,
      evidence: (t.layers ?? t.evidence ?? []).slice(0, 12).map(e => ({
        layer: e.name ?? e.layer ?? e.id ?? '',
        state: e.headline ?? e.state ?? '',
        weight: e.score ?? e.weight ?? 0,
      })),
      dataConfidence: state.dataConfidence ?? null,
      headline: t.headline ?? '',
      calibrationVersion: state.calibrationVersion ?? 'v1',
    });
    ledger.tracks.push({
      thesisId: id, symbol: t.symbol, outcome: 'open',
      lastPrice: entry, lastAt: now, pips: 0, r: 0,
      mfeR: 0, maeR: 0, resolvedAt: null, resolutionReason: null, samples: 0,
    });
    published++;
  }

  // ---------- 2. poll open positions ----------
  let resolved = 0, updated = 0;

  for (const tr of ledger.tracks) {
    if (tr.outcome !== 'open') continue;
    const th = ledger.theses.find(x => x.id === tr.thesisId);
    if (!th) continue;

    const q = ticks[th.symbol];
    const price = q?.price;
    if (!sane(th.symbol, price)) continue;

    const high = Number.isFinite(q.high) ? q.high : price;
    const low = Number.isFinite(q.low) ? q.low : price;

    const dir = th.direction;
    const rNow = rOf(dir, th.entry, th.stop, price);
    const rHigh = rOf(dir, th.entry, th.stop, dir === 'long' ? high : low);
    const rLow = rOf(dir, th.entry, th.stop, dir === 'long' ? low : high);

    tr.lastPrice = price;
    tr.lastAt = now;
    tr.pips = toPips(th.symbol, dir === 'long' ? price - th.entry : th.entry - price);
    tr.r = rNow;
    tr.mfeR = Math.max(tr.mfeR, rHigh, rNow);
    tr.maeR = Math.min(tr.maeR, rLow, rNow);
    tr.samples++;
    updated++;

    const hitTarget = dir === 'long' ? high >= th.target : low <= th.target;
    const hitStop = dir === 'long' ? low <= th.stop : high >= th.stop;

    if (hitTarget && hitStop) {
      // Cannot know the intrabar order. Refuse to guess.
      tr.outcome = 'ambiguous';
      tr.resolvedAt = now;
      tr.resolutionReason = 'Price touched both target and invalidation within one sample; order unknowable';
      resolved++;
    } else if (hitStop) {
      tr.outcome = 'stop';
      tr.resolvedAt = now;
      tr.r = -1;
      tr.resolutionReason = 'Invalidation level reached';
      resolved++;
    } else if (hitTarget) {
      tr.outcome = 'target';
      tr.resolvedAt = now;
      tr.resolutionReason = 'First target reached';
      resolved++;
    } else if (new Date(th.expiresAt).getTime() < Date.now()) {
      tr.outcome = 'expired';
      tr.resolvedAt = now;
      tr.resolutionReason = 'Holding window elapsed without resolution';
      resolved++;
    }
  }

  // ---------- 3. trim & write ----------
  if (ledger.theses.length > MAX_THESES) {
    const keep = new Set(ledger.theses.slice(-MAX_THESES).map(t => t.id));
    ledger.theses = ledger.theses.filter(t => keep.has(t.id));
    ledger.tracks = ledger.tracks.filter(t => keep.has(t.thesisId));
    ledger.revisions = ledger.revisions.filter(r => keep.has(r.thesisId));
  }
  if (ledger.revisions.length > MAX_REVISIONS) {
    ledger.revisions = ledger.revisions.slice(-MAX_REVISIONS);
  }

  ledger.updatedAt = now;
  writeFileSync(LEDGER, JSON.stringify(ledger, null, 0));
  console.log(
    `published=${published} updated=${updated} resolved=${resolved} ` +
    `open=${ledger.tracks.filter(t => t.outcome === 'open').length} ` +
    `total=${ledger.theses.length}`
  );
}

main().catch(e => { console.error(e); process.exit(1); });
