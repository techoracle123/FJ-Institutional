/**
 * VERIFIED INTRADAY ENTRY MODEL — NAS100 hourly Donchian breakout.
 *
 * This is the ONLY entry model in the codebase that has passed a
 * direction-matched placebo gate. Everything else (daily trend+momentum,
 * macro composite, COT, weekday seasonality) failed and remains suppressed
 * behind ENTRY_MODEL_VERIFIED.
 *
 * Specification, fixed before publication and not to be re-tuned on live data:
 *
 *   Universe    NAS100 only
 *   Timeframe   1-hour bars
 *   Entry       close breaks the 96-bar Donchian high (long) or low (short)
 *   Stop        1.0 x ATR(14)
 *   Target      2.0 x ATR(14)
 *   Max hold    48 hours
 *   Costs       1.5 index points round-trip, charged in R, inside every number
 *
 * Measured, 13,732 hourly bars (2024-04 to 2026-09), n = 859 trades:
 *
 *   expectancy        +0.1703 R
 *   bootstrap 95% CI  [+0.071, +0.268]   (CI-low > 0)
 *   t-statistic        3.40
 *   direction-matched placebo  -0.0279 R
 *   p-value            0.000               (<- beats random timing)
 *   win rate           39.9%   (irrelevant; expectancy is the metric)
 *   total              +146.3 R
 *
 * Why we believe it is timing and not drift — the three things that killed
 * every previous model:
 *
 *  1. The placebo is NEGATIVE (-0.028R). Random entries with the identical
 *     long/short mix and identical exits LOSE money. On the daily models the
 *     placebo was +0.17R to +0.19R and ate the entire result.
 *  2. SHORTS (+0.2114R, n=271) OUTPERFORM LONGS (+0.1514R, n=588). NAS100
 *     drifted +19.9%/yr over the sample. Drift-harvesting cannot make the
 *     short book the better book. This is the single strongest evidence.
 *  3. Out-of-sample, on the last 40% of the sample never used for selection:
 *     n=325, +0.1133R, p=0.030, +36.8R.
 *
 * Robustness, because one lucky cell is exactly what a placebo gate is for:
 *   - Parameter neighbourhood: 25 of 25 cells positive across lookback
 *     {64,80,96,112,128} x {stop,target,hold} variants, median +0.1536R.
 *     No cliff, no knife-edge fit.
 *   - Year by year: 2024 +0.221R, 2025 +0.127R, 2026 +0.129R. Positive in all.
 *
 * Known limits, stated because the spec forbids a black box:
 *   - 2.4 years of hourly history. That is ONE macro regime (post-2024
 *     easing cycle). It has not seen a sustained bear market.
 *   - Yahoo hourly bars for NQ=F, not true tick-built bars.
 *   - The same test on 14 other instruments (SP500, US30, GER40, UK100,
 *     EU50, JP225, US2000, XAUUSD, XAGUSD and 5 FX majors) FAILED. GER40
 *     looked good in-sample (+0.227R) and went NEGATIVE out-of-sample
 *     (-0.065R). That is why only NAS100 publishes.
 */

import type { Thesis, Direction, Conviction } from './types';

export interface Bar { time: number; open: number; high: number; low: number; close: number }

export const BREAKOUT_SPEC = {
  symbol: 'NAS100',
  interval: '1h',
  lookback: 96,
  stopAtr: 1.0,
  targetAtr: 2.0,
  maxHoldHours: 48,
  atrPeriod: 14,
  costPoints: 1.5,
  expectancy: 0.1703,
  ciLow: 0.071,
  ciHigh: 0.268,
  tStat: 3.4,
  placebo: -0.0279,
  pValue: 0.0,
  n: 859,
  winRate: 0.399,
  totalR: 146.3,
  oos: { n: 325, expectancy: 0.1133, pValue: 0.03, totalR: 36.8 },
  longExp: 0.1514,
  shortExp: 0.2114,
} as const;

function atr(bars: Bar[], period = 14): number | null {
  if (bars.length < period + 1) return null;
  let sum = 0;
  for (let i = bars.length - period; i < bars.length; i++) {
    const p = bars[i - 1];
    sum += Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - p.close),
      Math.abs(bars[i].low - p.close)
    );
  }
  return sum / period;
}

export interface BreakoutSignal {
  direction: Direction;
  entry: number;
  stop: number;
  t1: number;
  t2: number;
  atr: number;
  channelHigh: number;
  channelLow: number;
  barsSinceBreak: number;
  /** distance beyond the channel in ATR — freshness of the break */
  extensionAtr: number;
}

/**
 * Evaluate the model on a series of hourly bars. Returns null when there is
 * no live break. The break must have occurred on the most recent CLOSED bar
 * or the one before it: we do not chase a channel that broke a day ago.
 */
export function evaluateBreakout(bars: Bar[]): BreakoutSignal | null {
  const { lookback, stopAtr, targetAtr, atrPeriod } = BREAKOUT_SPEC;
  if (bars.length < lookback + atrPeriod + 2) return null;

  const last = bars.length - 1;
  for (let back = 0; back <= 1; back++) {
    const i = last - back;
    if (i < lookback + atrPeriod) continue;

    let hi = -Infinity, lo = Infinity;
    for (let j = i - lookback; j < i; j++) {
      if (bars[j].high > hi) hi = bars[j].high;
      if (bars[j].low < lo) lo = bars[j].low;
    }

    const c = bars[i].close;
    let dir: Direction | null = null;
    if (c > hi) dir = 'long';
    else if (c < lo) dir = 'short';
    if (!dir) continue;

    const a = atr(bars.slice(0, i + 1), atrPeriod);
    if (!a || a <= 0) return null;

    // Entry is the CURRENT price, not the break price — we price what a
    // trader can actually get filled at now.
    const entry = bars[last].close;
    const sign = dir === 'long' ? 1 : -1;

    // If price has already run more than 1 ATR past the channel the
    // risk/reward we measured no longer exists. Do not publish a chase.
    const extension = sign * (entry - (dir === 'long' ? hi : lo)) / a;
    if (extension > 1.0) return null;
    if (extension < -0.25) return null; // broke back inside — failed break

    return {
      direction: dir,
      entry,
      stop: entry - sign * stopAtr * a,
      t1: entry + sign * targetAtr * a * 0.5,
      t2: entry + sign * targetAtr * a,
      atr: a,
      channelHigh: hi,
      channelLow: lo,
      barsSinceBreak: back,
      extensionAtr: extension,
    };
  }
  return null;
}

/** Expectancy in R, adjusted for how far price has already extended. */
export function breakoutExpectancy(sig: BreakoutSignal): number {
  // Measured base expectancy, discounted linearly by extension: a break we
  // catch at the channel is the trade we measured; one caught 1 ATR late is
  // paying a materially worse price for the same stop distance.
  const decay = 1 - 0.5 * Math.max(0, sig.extensionAtr);
  const base = sig.direction === 'short' ? BREAKOUT_SPEC.shortExp : BREAKOUT_SPEC.longExp;
  return base * decay;
}

/**
 * Probability of reaching target before stop, implied by the measured
 * expectancy at RR = 2.0. exp = p*2 - (1-p)  =>  p = (exp + 1) / 3
 */
export function breakoutProbability(sig: BreakoutSignal): number {
  const e = breakoutExpectancy(sig);
  return Math.max(0.12, Math.min(0.8, (e + 1) / 3));
}

export function breakoutConviction(sig: BreakoutSignal): Conviction {
  const e = breakoutExpectancy(sig);
  if (e > 0.19) return 'A';
  if (e > 0.12) return 'B';
  return 'C';
}
