// ============================================================
// MARKET REGIME — a first-class layer, not a decoration.
//
// Research finding (research/SCALPING_RESULTS_R1.md) that justifies this:
// on identical signals, mean reversion returned -0.07R in chop_high but
// -0.81R in trend_low. A blended number (-0.35R) hid a 10x difference.
// The same logic applies to thesis probability: a 43% call in a trending
// market is NOT the same bet as a 43% call in chop, and until now we
// treated them identically.
//
// Two independent axes:
//   structure : trend | chop        -- directional or mean-reverting?
//   vol       : low | normal | high -- how big are the swings?
//
// Thresholds are trailing PERCENTILES, never constants. A fixed efficiency
// ratio of 0.35 sat at the ~90th percentile of real 5m FX data and labelled
// 95% of bars "chop", making the trend buckets useless. Percentiles adapt
// per instrument and per era.
// ============================================================

export type RegimeStructure = 'trend' | 'chop';
export type RegimeVol = 'low' | 'normal' | 'high';
export type RegimeId =
  | 'trend_low' | 'trend_normal' | 'trend_high'
  | 'chop_low' | 'chop_normal' | 'chop_high';

export type Regime = {
  id: RegimeId;
  structure: RegimeStructure;
  vol: RegimeVol;
  /** Kaufman efficiency ratio: |net move| / total path. 1 = straight line. */
  efficiency: number;
  /** Lag-1 autocorrelation of returns. >0 momentum persists, <0 reverts. */
  autocorr: number;
  /** Realised vol percentile vs trailing history (0-100). */
  volPct: number;
  /** Plain-language read for the UI. No jargon. */
  label: string;
  description: string;
  /** How much to trust a thesis here, 0.85-1.0. Feeds probability shrink. */
  reliability: number;
};

export const REGIME_META: Record<RegimeId, { label: string; description: string }> = {
  trend_low: {
    label: 'Quiet Trend',
    description: 'Price is grinding in one direction with small swings. Pullbacks are shallow and fading the move has historically been the worst thing to do.',
  },
  trend_normal: {
    label: 'Trending',
    description: 'A clear direction with normal-sized swings. Continuation setups are favoured over reversals.',
  },
  trend_high: {
    label: 'Violent Trend',
    description: 'Strong direction with large swings. Moves are real but stops need room, and entries chase easily.',
  },
  chop_low: {
    label: 'Coiled Range',
    description: 'Price is going nowhere on small swings. Breakouts mostly fail, and costs eat most of what the range offers.',
  },
  chop_normal: {
    label: 'Ranging',
    description: 'No net direction with normal swings. Extremes tend to revert rather than extend.',
  },
  chop_high: {
    label: 'Volatile Chop',
    description: 'Large swings with no net progress. The most treacherous state: moves look like breakouts and then reverse.',
  },
};

/** Reliability multiplier applied to thesis probability, from research. */
const RELIABILITY: Record<RegimeId, number> = {
  trend_normal: 1.0,
  trend_high: 0.95,
  chop_normal: 0.95,
  chop_low: 0.92,
  trend_low: 0.9,
  chop_high: 0.88,
};

function mean(xs: number[]) {
  return xs.reduce((s, v) => s + v, 0) / Math.max(xs.length, 1);
}

export function efficiencyRatio(closes: number[]): number {
  if (closes.length < 3) return 0;
  const net = Math.abs(closes[closes.length - 1] - closes[0]);
  let path = 0;
  for (let i = 1; i < closes.length; i++) path += Math.abs(closes[i] - closes[i - 1]);
  return path > 0 ? net / path : 0;
}

export function autocorr1(rets: number[]): number {
  const n = rets.length;
  if (n < 8) return 0;
  const m = mean(rets);
  let num = 0, den = 0;
  for (let i = 1; i < n; i++) num += (rets[i] - m) * (rets[i - 1] - m);
  for (let i = 0; i < n; i++) den += (rets[i] - m) ** 2;
  return den > 0 ? num / den : 0;
}

function stdev(xs: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, v) => s + (v - m) ** 2, 0) / (n - 1));
}

function pctRank(v: number, hist: number[]): number {
  if (!hist.length) return 50;
  const s = [...hist].sort((a, b) => a - b);
  let lo = 0;
  while (lo < s.length && s[lo] < v) lo++;
  return Math.round((lo / s.length) * 100);
}

/**
 * Classify the regime from a close series (oldest → newest).
 * `window` bars define the current structure; the rest is trailing baseline.
 */
export function classifyRegime(closes: number[], window = 48): Regime | null {
  if (closes.length < window + 20) return null;

  const recent = closes.slice(-(window + 1));
  const rets: number[] = [];
  for (let i = 1; i < recent.length; i++) rets.push(recent[i] - recent[i - 1]);

  const er = efficiencyRatio(recent);
  const ac = autocorr1(rets);
  const rv = stdev(rets);

  // Trailing distributions of the same two measures.
  const erHist: number[] = [];
  const rvHist: number[] = [];
  const step = Math.max(1, Math.floor((closes.length - window) / 120));
  for (let i = window; i < closes.length; i += step) {
    const w = closes.slice(i - window, i + 1);
    const r: number[] = [];
    for (let k = 1; k < w.length; k++) r.push(w[k] - w[k - 1]);
    erHist.push(efficiencyRatio(w));
    rvHist.push(stdev(r));
  }

  const erSorted = [...erHist].sort((a, b) => a - b);
  const erThresh = erSorted.length >= 20
    ? erSorted[Math.floor(erSorted.length * 0.6)]
    : 0.3;

  const structure: RegimeStructure = er >= erThresh && ac > -0.05 ? 'trend' : 'chop';

  const volPct = pctRank(rv, rvHist);
  const vol: RegimeVol = volPct <= 33 ? 'low' : volPct >= 67 ? 'high' : 'normal';

  const id = `${structure}_${vol}` as RegimeId;
  const meta = REGIME_META[id];

  return {
    id,
    structure,
    vol,
    efficiency: Math.round(er * 1000) / 1000,
    autocorr: Math.round(ac * 1000) / 1000,
    volPct,
    label: meta.label,
    description: meta.description,
    reliability: RELIABILITY[id],
  };
}
