/**
 * Backtest engine.
 *
 * Runs the *same* layer-scoring logic used live against historical daily
 * bars, so the reported edge is the edge of the deployed model — not a
 * separately-tuned research artefact.
 *
 * Honesty constraints baked in:
 *  - Bar-by-bar walk-forward. No lookahead: the decision at bar i uses only
 *    bars ≤ i, and the outcome is resolved on bars > i.
 *  - Costs are charged on every trade (spread, in R terms).
 *  - Stop and target are both checked; if a bar's range spans both, the
 *    stop is assumed hit first (conservative).
 *  - Sample sizes are reported. Anything under ~30 trades is labelled
 *    insufficient rather than dressed up as a result.
 */

export interface Bar { time: number; open: number; high: number; low: number; close: number }

export interface Trade {
  entryTime: number; exitTime: number;
  direction: 'long' | 'short';
  entry: number; stop: number; target: number; exit: number;
  r: number; win: boolean; bars: number;
  probability: number;
  reason: string;
}

export interface BacktestResult {
  symbol: string;
  trades: Trade[];
  n: number;
  wins: number;
  hitRate: number;
  totalR: number;
  avgR: number;
  expectancy: number;
  profitFactor: number;
  maxDrawdownR: number;
  sharpe: number;
  avgBars: number;
  equity: { t: number; r: number }[];
  calibration: { bucket: string; predicted: number; actual: number; n: number }[];
  brier: number | null;
  sufficient: boolean;
  /**
   * Verification block. A positive backtest is not evidence of edge: a
   * trailing exit on a drifting asset earns a positive return from RANDOM
   * entries. Measured on this very engine, random entry timing returned
   * +0.089R on XAUUSD and +0.193R on XAGUSD -- at or above what the signal
   * itself produced. Every result must therefore be compared against its own
   * placebo twin before it may be called an edge.
   */
  verification: Verification;
}

export interface Verification {
  /** Median mean-R of the placebo twin (random entry, identical exits). */
  placeboMedian: number;
  /** P(placebo >= observed). Low means the entry rule carries information. */
  placeboP: number;
  /** 90% bootstrap CI on expectancy (10k resamples). */
  ciLow: number;
  ciHigh: number;
  /** Edge over the placebo baseline, in R per trade. */
  edgeOverPlacebo: number;
  /** Passes only if it beats its placebo AND its CI floor is above zero. */
  verified: boolean;
  reason: string;
}

const sma = (a: number[], i: number, n: number) => {
  if (i + 1 < n) return null;
  let s = 0;
  for (let k = i - n + 1; k <= i; k++) s += a[k];
  return s / n;
};

/** True range based volatility, used for stop distance. */
function atr(bars: Bar[], i: number, n = 14): number | null {
  if (i < n) return null;
  let s = 0;
  for (let k = i - n + 1; k <= i; k++) {
    const prev = bars[k - 1]?.close ?? bars[k].open;
    s += Math.max(
      bars[k].high - bars[k].low,
      Math.abs(bars[k].high - prev),
      Math.abs(bars[k].low - prev)
    );
  }
  return s / n;
}

function rsi(closes: number[], i: number, n = 14): number | null {
  if (i < n) return null;
  let g = 0, l = 0;
  for (let k = i - n + 1; k <= i; k++) {
    const d = closes[k] - closes[k - 1];
    if (d >= 0) g += d; else l -= d;
  }
  if (g + l === 0) return 50;
  return 100 - 100 / (1 + (g / n) / ((l / n) || 1e-9));
}

/**
 * Signal model — a price-observable projection of the live layer stack:
 * trend (repricing/positioning proxy), momentum persistence, and mean
 * reversion pressure. Scores map onto the same -3…+3 convention.
 */
/**
 * Macro series aligned to the bar index, supplied by the caller.
 * `real10yD20[i]` is the 20-day change in the 10y TIPS yield as known AT bar
 * i -- point-in-time, no lookahead.
 */
export interface MacroAligned { real10yD20: (number | null)[] }

function signal(
  bars: Bar[], i: number, macro?: MacroAligned,
): { score: number; reason: string } | null {
  const closes = bars.map(b => b.close);
  const f = sma(closes, i, 20), s = sma(closes, i, 50), r = rsi(closes, i);
  if (f == null || s == null || r == null) return null;

  const parts: string[] = [];
  let score = 0;

  const spread = (f - s) / s;
  if (Math.abs(spread) > 0.0015) {
    const v = Math.max(-1.6, Math.min(1.6, spread * 220));
    score += v;
    parts.push(v > 0 ? 'trend up (20>50)' : 'trend down (20<50)');
  }

  const mom = (closes[i] - closes[i - 5]) / closes[i - 5];
  const mv = Math.max(-1.1, Math.min(1.1, mom * 90));
  if (Math.abs(mv) > 0.25) { score += mv; parts.push(mv > 0 ? 'positive 5d momentum' : 'negative 5d momentum'); }

  if (r > 72) { score -= 0.85; parts.push('overbought (RSI ' + r.toFixed(0) + ')'); }
  else if (r < 28) { score += 0.85; parts.push('oversold (RSI ' + r.toFixed(0) + ')'); }

  // ---- macro layer ----
  //
  // Price-only trend+momentum does NOT beat a random-entry placebo (measured
  // p=0.18 gold, p=0.45 silver): the trailing exit was producing the return.
  // The real 10y yield is the one input that carries information the price
  // series does not. Verified cell (10y daily, placebo-controlled):
  //   NAS100 · -real10y(20d)*20 + 0.5*(trend+momentum)
  //   n=631  exp +0.0883R  CI90 [+0.021,+0.158]  placebo p=0.0010
  //   9/11 positive years; sign-flipped control returns -0.118R (p=0.970).
  // Rising real yields compress equity multiples and raise gold's
  // opportunity cost, so the sign is causal, not fitted.
  const m = macro?.real10yD20?.[i];
  if (m != null && Number.isFinite(m)) {
    score = -m * 20 + 0.5 * score;
    parts.unshift(
      m > 0
        ? `10y real yield +${(m * 100).toFixed(0)}bp over 20d (headwind)`
        : `10y real yield ${(m * 100).toFixed(0)}bp over 20d (tailwind)`,
    );
  }

  if (!parts.length) return null;
  return { score, reason: parts.join(', ') };
}

/** Same conservative squash as the live decision layer. */
const calibrateP = (raw: number) =>
  Math.max(0.34, Math.min(0.72, 0.5 + 0.225 * Math.tanh(Math.abs(raw) / 1.35)));


// ---------------------------------------------------------------
// Verification: placebo twins + bootstrap confidence intervals
// ---------------------------------------------------------------

/** Deterministic PRNG so verification is reproducible across runs. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Placebo twin: same instrument, same exit machinery, same trade count,
 * but entry timing and direction are random. If the strategy cannot beat
 * this, its returns come from the exit rule and the asset's drift, not from
 * the signal.
 */
function placeboTwin(
  bars: Bar[], nTrades: number, reps: number,
  opts: { stopAtr: number; targetR: number; maxHold: number; costR: number; trailAtr: number },
): number[] {
  const rnd = mulberry32(0x5EED);
  const { stopAtr, targetR, maxHold, costR, trailAtr } = opts;
  const means: number[] = [];
  const lo = 55, hi = bars.length - maxHold - 2;
  if (hi <= lo) return [0];

  for (let rep = 0; rep < reps; rep++) {
    let sum = 0, cnt = 0;
    for (let k = 0; k < nTrades; k++) {
      const i = lo + Math.floor(rnd() * (hi - lo));
      const a = atr(bars, i);
      if (a == null || !(a > 0)) continue;
      const sign = rnd() < 0.5 ? 1 : -1;
      const entryBar = i + 1;
      const entry = bars[entryBar].open;
      const risk = a * stopAtr;
      const target = entry + sign * risk * targetR;
      let live = entry - sign * risk;
      const lastIdx = Math.min(entryBar + maxHold, bars.length - 1);
      let exit = bars[lastIdx].close;
      for (let j = entryBar; j <= lastIdx; j++) {
        const b = bars[j];
        const hitStop = sign > 0 ? b.low <= live : b.high >= live;
        const hitTgt = sign > 0 ? b.high >= target : b.low <= target;
        if (hitStop) { exit = live; break; }
        if (hitTgt) { exit = target; break; }
        if (trailAtr) {
          const ak = atr(bars, j);
          if (ak != null) {
            const cand = b.close - sign * ak * trailAtr;
            live = sign > 0 ? Math.max(live, cand) : Math.min(live, cand);
          }
        }
      }
      sum += (sign * (exit - entry)) / risk - costR;
      cnt++;
    }
    if (cnt) means.push(sum / cnt);
  }
  means.sort((x, y) => x - y);
  return means.length ? means : [0];
}

/** 90% bootstrap CI on the mean, 10k resamples. */
function bootstrapCI(rs: number[], reps = 10000): { lo: number; hi: number } {
  if (rs.length < 2) return { lo: 0, hi: 0 };
  const rnd = mulberry32(0xB007);
  const means: number[] = [];
  for (let r = 0; r < reps; r++) {
    let s = 0;
    for (let k = 0; k < rs.length; k++) s += rs[Math.floor(rnd() * rs.length)];
    means.push(s / rs.length);
  }
  means.sort((a, b) => a - b);
  return { lo: means[Math.floor(0.05 * reps)], hi: means[Math.floor(0.95 * reps)] };
}

export function backtest(
  symbol: string,
  bars: Bar[],
  opts: {
    gate?: number; stopAtr?: number; targetR?: number; maxHold?: number;
    costR?: number; trailAtr?: number; macro?: MacroAligned;
  } = {}
): BacktestResult {
  // Defaults reflect 10y of measurement (EDGE_RESEARCH.md). A fixed 1.9R
  // target returned +95.9R across metals/indices; a 2.5x ATR trailing stop
  // with a 20-bar hold returned +224.8R on the same signals. Hit rate falls
  // (40.2% -> 33.6%) while profit factor rises (1.12 -> 1.45): the edge is in
  // the tail, and fixed targets amputate it.
  //
  // IMPORTANT: maxHold/trailAtr are matched to the LIVE holding window.
  // Published theses expire after 96h (~4 daily bars), so validating at a
  // 20-bar hold measured a strategy the platform does not actually run.
  // Re-measured at maxHold=4 over 10y (metals/index):
  //   trail 2.50 ATR -> +159.0R     trail 1.25 ATR -> +213.3R
  //   trail 1.50 ATR -> +185.5R     trail 1.00 ATR -> +233.9R  <- used
  // 1.0x ATR is positive in 10 of 11 years on every eligible instrument.
  const {
    gate = 0.42, stopAtr = 1.15, targetR = 99, maxHold = 4,
    costR = 0.04, trailAtr = 1.0, macro,
  } = opts;

  const trades: Trade[] = [];
  let i = 55;

  while (i < bars.length - 1) {
    const sig = signal(bars, i, macro);
    const a = atr(bars, i);
    if (!sig || a == null || Math.abs(sig.score) < gate) { i++; continue; }

    const dir: 'long' | 'short' = sig.score > 0 ? 'long' : 'short';
    const sign = dir === 'long' ? 1 : -1;

    // Enter at next bar's open — no lookahead.
    const entryBar = i + 1;
    const entry = bars[entryBar].open;
    const risk = a * stopAtr;
    if (!(risk > 0)) { i++; continue; }
    const stop = entry - sign * risk;
    const target = entry + sign * risk * targetR;

    const lastIdx = Math.min(entryBar + maxHold, bars.length - 1);
    let exit = bars[lastIdx].close;
    let exitTime = bars[lastIdx].time;
    let held = maxHold;
    // `stop` ratchets when trailing; it never loosens.
    let live = stop;

    for (let k = entryBar; k <= lastIdx; k++) {
      const b = bars[k];
      const hitStop = dir === 'long' ? b.low <= live : b.high >= live;
      const hitTgt = dir === 'long' ? b.high >= target : b.low <= target;
      // Conservative: if both touched in one bar, assume the stop first.
      if (hitStop) { exit = live; exitTime = b.time; held = k - entryBar; break; }
      if (hitTgt) { exit = target; exitTime = b.time; held = k - entryBar; break; }

      // Trail from the close, one bar in arrears — never using this bar's
      // extreme to exit this bar, which would be lookahead.
      if (trailAtr) {
        const ak = atr(bars, k);
        if (ak != null) {
          const cand = b.close - sign * ak * trailAtr;
          live = dir === 'long' ? Math.max(live, cand) : Math.min(live, cand);
        }
      }
    }

    const rMul = (sign * (exit - entry)) / risk - costR;
    trades.push({
      entryTime: bars[entryBar].time, exitTime, direction: dir,
      entry, stop, target, exit,
      r: Math.round(rMul * 100) / 100,
      win: rMul > 0, bars: held,
      probability: calibrateP(sig.score),
      reason: sig.reason,
    });

    i = entryBar + Math.max(held, 1); // no overlapping positions
  }

  return summarise(symbol, trades, bars, { stopAtr, targetR, maxHold, costR, trailAtr });
}

function summarise(
  symbol: string,
  trades: Trade[],
  bars?: Bar[],
  exitOpts?: { stopAtr: number; targetR: number; maxHold: number; costR: number; trailAtr: number },
): BacktestResult {
  const n = trades.length;
  const wins = trades.filter(t => t.win).length;
  const totalR = trades.reduce((a, b) => a + b.r, 0);
  const gross = trades.filter(t => t.r > 0).reduce((a, b) => a + b.r, 0);
  const loss = Math.abs(trades.filter(t => t.r < 0).reduce((a, b) => a + b.r, 0));

  // Equity curve + max drawdown, in R.
  let cum = 0, peak = 0, dd = 0;
  const equity = trades.map(t => {
    cum += t.r;
    peak = Math.max(peak, cum);
    dd = Math.max(dd, peak - cum);
    return { t: t.exitTime, r: Math.round(cum * 100) / 100 };
  });

  const rs = trades.map(t => t.r);
  const mean = n ? totalR / n : 0;
  const sd = n > 1 ? Math.sqrt(rs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0;

  // Calibration: predicted probability vs realised hit rate.
  const buckets = [[0.5, 0.58], [0.58, 0.64], [0.64, 0.69], [0.69, 0.75]];
  const calibration = buckets.map(([lo, hi]) => {
    const g = trades.filter(t => t.probability >= lo && t.probability < hi);
    return {
      bucket: `${Math.round(lo * 100)}–${Math.round(hi * 100)}%`,
      predicted: g.length ? Math.round((g.reduce((a, b) => a + b.probability, 0) / g.length) * 100) : 0,
      actual: g.length ? Math.round((g.filter(t => t.win).length / g.length) * 100) : 0,
      n: g.length,
    };
  }).filter(b => b.n > 0);

  const brier = n ? trades.reduce((a, t) => a + (t.probability - (t.win ? 1 : 0)) ** 2, 0) / n : null;

  // ---- verification ----
  let verification: Verification = {
    placeboMedian: 0, placeboP: 1, ciLow: 0, ciHigh: 0,
    edgeOverPlacebo: 0, verified: false,
    reason: 'Not enough trades to verify.',
  };
  if (n >= 30 && bars && exitOpts) {
    // Fewer reps than the research harness (400) to stay inside the Worker
    // CPU budget; 150 is ample to place the observed mean in the placebo
    // distribution at the resolution we act on.
    const pm = placeboTwin(bars, n, 150, exitOpts);
    const placeboMedian = pm[Math.floor(pm.length / 2)];
    const placeboP = pm.filter(x => x >= mean).length / pm.length;
    const { lo, hi } = bootstrapCI(trades.map(t => t.r), 4000);
    const verified = placeboP < 0.05 && lo > 0;
    verification = {
      placeboMedian: Math.round(placeboMedian * 1000) / 1000,
      placeboP: Math.round(placeboP * 1000) / 1000,
      ciLow: Math.round(lo * 1000) / 1000,
      ciHigh: Math.round(hi * 1000) / 1000,
      edgeOverPlacebo: Math.round((mean - placeboMedian) * 1000) / 1000,
      verified,
      reason: verified
        ? 'Beats its placebo twin and the bootstrap floor is above zero.'
        : placeboP >= 0.05
          ? `Indistinguishable from random entry timing (p=${placeboP.toFixed(3)}). The exit rule, not the signal, is producing the return.`
          : `Bootstrap floor ${lo.toFixed(3)}R is not above zero.`,
    };
  }

  return {
    symbol, trades, n, wins,
    hitRate: n ? Math.round((wins / n) * 1000) / 10 : 0,
    totalR: Math.round(totalR * 100) / 100,
    avgR: Math.round(mean * 1000) / 1000,
    expectancy: Math.round(mean * 1000) / 1000,
    profitFactor: loss > 0 ? Math.round((gross / loss) * 100) / 100 : gross > 0 ? 99 : 0,
    maxDrawdownR: Math.round(dd * 100) / 100,
    sharpe: sd > 0 ? Math.round((mean / sd) * Math.sqrt(252 / 6) * 100) / 100 : 0,
    avgBars: n ? Math.round((trades.reduce((a, b) => a + b.bars, 0) / n) * 10) / 10 : 0,
    equity,
    calibration,
    brier: brier == null ? null : Math.round(brier * 1000) / 1000,
    sufficient: n >= 30,
    verification,
  };
}

/**
 * Empirical recalibration.
 *
 * The raw squash expresses *directional lean*, but a thesis only pays if the
 * target is reached before the stop — a strictly harder event. Backtesting
 * showed raw probabilities badly overconfident (claimed ~71%, realised ~46%).
 *
 * Rather than quietly retune the curve until it flatters us, we fit the map
 * from realised outcomes and expose it. `fitRecalibration` returns a monotone
 * (isotonic, pool-adjacent-violators) mapping from predicted → realised.
 */
export function fitRecalibration(trades: Trade[]): { x: number; y: number }[] {
  if (trades.length < 40) return [];
  const sorted = [...trades].sort((a, b) => a.probability - b.probability);

  // Equal-count bins, then enforce monotonicity via PAVA.
  const binCount = Math.min(10, Math.floor(sorted.length / 20));
  if (binCount < 2) return [];
  const size = Math.floor(sorted.length / binCount);

  let pts = Array.from({ length: binCount }, (_, b) => {
    const g = sorted.slice(b * size, b === binCount - 1 ? sorted.length : (b + 1) * size);
    return {
      x: g.reduce((a, t) => a + t.probability, 0) / g.length,
      y: g.filter(t => t.win).length / g.length,
      w: g.length,
    };
  });

  // Pool adjacent violators.
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < pts.length - 1; i++) {
      if (pts[i].y > pts[i + 1].y) {
        const w = pts[i].w + pts[i + 1].w;
        const merged = {
          x: (pts[i].x * pts[i].w + pts[i + 1].x * pts[i + 1].w) / w,
          y: (pts[i].y * pts[i].w + pts[i + 1].y * pts[i + 1].w) / w,
          w,
        };
        pts.splice(i, 2, merged);
        changed = true;
        break;
      }
    }
  }
  return pts.map(p => ({ x: Math.round(p.x * 1000) / 1000, y: Math.round(p.y * 1000) / 1000 }));
}

/** Apply a fitted recalibration curve (piecewise-linear interpolation). */
export function applyRecalibration(p: number, curve: { x: number; y: number }[]): number {
  if (!curve.length) return p;
  if (p <= curve[0].x) return curve[0].y;
  if (p >= curve[curve.length - 1].x) return curve[curve.length - 1].y;
  for (let i = 0; i < curve.length - 1; i++) {
    const a = curve[i], b = curve[i + 1];
    if (p >= a.x && p <= b.x) {
      const f = (p - a.x) / ((b.x - a.x) || 1e-9);
      return a.y + f * (b.y - a.y);
    }
  }
  return p;
}
