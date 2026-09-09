// ============================================================
// INTELLIGENCE ENGINES
// Real computation over real data. No hardcoded market direction.
// Every output carries observability + confidence.
// ============================================================
import { fredLatest, FRED_IDS, quotes, cotSnapshot, calendar, history, type RawQuote } from './datarouter';
import { classifyRegime as classifyPriceRegime, type Regime as PriceRegime } from './regime';
import type {
  RegimeState, RiskRegime, VolRegime, DollarRegime, LiquidityRegime,
  CrossAssetRow, Anomaly, WhatChanged,
} from './types';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const pctRank = (v: number, arr: number[]) => {
  if (!arr.length) return 50;
  const below = arr.filter(x => x < v).length;
  return Math.round((below / arr.length) * 100);
};

export interface MacroSnapshot {
  us2y: number; us2yChg: number;
  us10y: number; us10yChg: number;
  real10y: number; real10yChg: number;
  curve: number; curveChg: number;
  hyOas: number; hyOasChg: number;
  vix: number; vixChg: number; vixPct: number;
  dxy: number; dxyChg: number;
  breakeven: number;
  netLiquidity: number | null;
  asOf: string;
  ok: boolean;
  seriesReal10y: { date: string; value: number }[];
  seriesUs2y: { date: string; value: number }[];
  seriesVix: { date: string; value: number }[];
  /** Raw histories kept so correlations can be measured, never assumed. */
  hist: Record<string, { date: string; value: number }[]>;
}

export async function macroSnapshot(): Promise<MacroSnapshot> {
  const [us2, us10, real10, curve, hy, vix, dxy, be, bs, tga, rrp] = await Promise.all([
    fredLatest(FRED_IDS.US2Y, 5),
    fredLatest(FRED_IDS.US10Y, 5),
    fredLatest(FRED_IDS.REAL10Y, 5),
    fredLatest(FRED_IDS.CURVE_2S10S, 5),
    fredLatest(FRED_IDS.HY_OAS, 5),
    fredLatest(FRED_IDS.VIX, 5),
    fredLatest(FRED_IDS.DXY, 5),
    fredLatest(FRED_IDS.BREAKEVEN10Y, 5),
    fredLatest(FRED_IDS.FED_BS, 2),
    fredLatest(FRED_IDS.TGA, 2),
    fredLatest(FRED_IDS.RRP, 2),
  ]);

  const vixSeries = vix?.series.map(s => s.value) ?? [];
  const netLiq = bs && tga && rrp ? bs.value / 1000 - tga.value / 1000 - rrp.value : null;

  return {
    us2y: us2?.value ?? NaN, us2yChg: us2?.change ?? 0,
    us10y: us10?.value ?? NaN, us10yChg: us10?.change ?? 0,
    real10y: real10?.value ?? NaN, real10yChg: real10?.change ?? 0,
    curve: curve?.value ?? NaN, curveChg: curve?.change ?? 0,
    hyOas: hy?.value ?? NaN, hyOasChg: hy?.change ?? 0,
    vix: vix?.value ?? NaN, vixChg: vix?.change ?? 0,
    vixPct: vix ? pctRank(vix.value, vixSeries) : 50,
    dxy: dxy?.value ?? NaN, dxyChg: dxy?.change ?? 0,
    breakeven: be?.value ?? NaN,
    netLiquidity: netLiq,
    asOf: us2?.date ?? '',
    ok: !!us2 && !!real10,
    seriesReal10y: real10?.series ?? [],
    seriesUs2y: us2?.series ?? [],
    seriesVix: vix?.series ?? [],
    hist: {
      US2Y: us2?.series ?? [], US10Y: us10?.series ?? [],
      REAL10Y: real10?.series ?? [], CURVE: curve?.series ?? [],
      HYOAS: hy?.series ?? [], VIX: vix?.series ?? [],
      DXY: dxy?.series ?? [], BE10Y: be?.series ?? [],
    },
  };
}

// ---------------------------------------------------------------
// REGIME ENGINE — composite scoring, confidence from agreement
// ---------------------------------------------------------------
export function classifyRegime(m: MacroSnapshot, q: Record<string, RawQuote>): RegimeState {
  const votes: { name: string; score: number; weight: number }[] = [];

  // VIX level & direction
  if (Number.isFinite(m.vix)) {
    const s = m.vix < 15 ? 1 : m.vix < 20 ? 0.4 : m.vix < 28 ? -0.4 : -1;
    votes.push({ name: 'Equity volatility (VIX)', score: s, weight: 1.2 });
  }
  // Credit spreads — the honest risk gauge
  if (Number.isFinite(m.hyOas)) {
    const s = m.hyOas < 3.2 ? 1 : m.hyOas < 4.2 ? 0.4 : m.hyOas < 5.5 ? -0.4 : -1;
    const dir = m.hyOasChg > 0.15 ? -0.5 : m.hyOasChg < -0.15 ? 0.4 : 0;
    votes.push({ name: 'Credit spreads (HY OAS)', score: clamp(s + dir, -1, 1), weight: 1.4 });
  }
  // Curve
  if (Number.isFinite(m.curve)) {
    votes.push({ name: 'Yield curve (2s10s)', score: clamp(m.curve / 1.2, -1, 1), weight: 0.6 });
  }
  // Equity momentum
  const nas = q['NAS100'];
  if (nas) votes.push({ name: 'Equity momentum (NDX)', score: clamp(nas.changePct / 1.2, -1, 1), weight: 1.0 });
  // Precious-metal bid = defensive
  const au = q['XAUUSD'];
  if (au) votes.push({ name: 'Precious-metal bid', score: clamp(-au.changePct / 1.4, -1, 1), weight: 0.7 });

  const totalW = votes.reduce((a, v) => a + v.weight, 0) || 1;
  const composite = votes.reduce((a, v) => a + v.score * v.weight, 0) / totalW;

  // Confidence = agreement among voters (low dispersion = high confidence)
  const mean = votes.reduce((a, v) => a + v.score, 0) / (votes.length || 1);
  const variance = votes.reduce((a, v) => a + (v.score - mean) ** 2, 0) / (votes.length || 1);
  const agreement = clamp(1 - Math.sqrt(variance), 0, 1);
  const riskConfidence = Math.round(48 + agreement * 46);

  let risk: RiskRegime;
  if (composite > 0.45) risk = 'risk-on';
  else if (composite > 0.12) risk = 'neutral';
  else if (composite > -0.2) risk = 'risk-off-transition';
  else if (composite > -0.65) risk = 'risk-off';
  else risk = 'crisis';

  // Volatility regime from VIX percentile
  let vol: VolRegime = 'normal';
  if (m.vixPct < 22) vol = 'compressed';
  else if (m.vixPct < 68) vol = 'normal';
  else if (m.vixPct < 90) vol = 'expanded';
  else vol = 'stressed';

  // Dollar regime — rate differential direction + spot
  const dxyMove = m.dxyChg;
  const rateImpulse = m.us2yChg;
  const dollarScore = clamp((dxyMove / 1.1) * 0.6 + clamp(rateImpulse / 0.16, -1, 1) * 0.4, -1, 1);
  let dollar: DollarRegime;
  if (dollarScore > 0.5) dollar = 'strongly-bullish';
  else if (dollarScore > 0.15) dollar = 'bullish';
  else if (dollarScore > -0.15) dollar = 'neutral';
  else if (dollarScore > -0.5) dollar = 'bearish';
  else dollar = 'strongly-bearish';

  // Liquidity
  let liquidity: LiquidityRegime = 'stable';
  if (Number.isFinite(m.hyOas)) {
    if (m.hyOasChg > 0.4) liquidity = 'stressed';
    else if (m.hyOasChg > 0.12) liquidity = 'contracting';
    else if (m.hyOasChg < -0.12) liquidity = 'expanding';
  }

  // Dominant driver — largest weighted absolute contribution
  const ranked = [...votes].sort((a, b) => Math.abs(b.score * b.weight) - Math.abs(a.score * a.weight));
  const dominant = ranked[0];

  const dollarWord =
    dollar.includes('bearish') ? 'dollar softness' :
    dollar.includes('bullish') ? 'dollar strength' : 'a directionless dollar';
  const rateWord = m.us2yChg > 0.04 ? 'front-end yields repricing higher'
    : m.us2yChg < -0.04 ? 'front-end yields repricing lower'
    : 'front-end yields broadly stable';

  return {
    risk, riskConfidence,
    vol, volConfidence: Math.round(60 + Math.abs(m.vixPct - 50) * 0.7),
    dollar, dollarConfidence: Math.round(52 + Math.abs(dollarScore) * 42),
    liquidity, liquidityConfidence: Number.isFinite(m.hyOas) ? 78 : 40,
    drivers: votes.map(v => ({
      name: v.name,
      weight: Math.round((Math.abs(v.score) * v.weight / totalW) * 100),
      direction: (v.score >= 0 ? 'supports' : 'opposes') as 'supports' | 'opposes',
    })).sort((a, b) => b.weight - a.weight),
    dominantDriver: dominant?.name ?? 'Insufficient data',
    dominantDriverStrength: dominant ? Math.round(Math.abs(dominant.score) * 100) : 0,
    narrative: `${rateWord.charAt(0).toUpperCase() + rateWord.slice(1)} alongside ${dollarWord}.`,
    previousNarrative: 'Higher-for-longer US rates',
    narrativeConfidence: riskConfidence,
    narrativeShift: Math.abs(m.us2yChg) > 0.08 ? 'accelerating' : 'stable',
  };
}

// ---------------------------------------------------------------
// CROSS-ASSET BOARD
// ---------------------------------------------------------------
/**
 * Pearson correlation of daily CHANGES between two date-aligned series.
 * Correlating levels would report spurious ~0.99 trends; changes are what
 * actually matter for cross-asset behaviour.
 */
function corrOfChanges(
  a: { date: string; value: number }[],
  b: { date: string; value: number }[]
): number | null {
  if (!a?.length || !b?.length) return null;
  const mb = new Map(b.map(p => [p.date, p.value]));
  const xs: number[] = [], ys: number[] = [];
  const sa = [...a].sort((p, q) => p.date.localeCompare(q.date));
  let pa: number | null = null, pb: number | null = null;
  for (const p of sa) {
    const v = mb.get(p.date);
    if (v == null) continue;
    if (pa != null && pb != null) { xs.push(p.value - pa); ys.push(v - pb); }
    pa = p.value; pb = v;
  }
  const n = xs.length;
  if (n < 30) return null;
  const mx = xs.reduce((s2, v) => s2 + v, 0) / n;
  const my = ys.reduce((s2, v) => s2 + v, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const a1 = xs[i] - mx, b1 = ys[i] - my;
    num += a1 * b1; dx += a1 * a1; dy += b1 * b1;
  }
  if (dx === 0 || dy === 0) return null;
  return Math.max(-1, Math.min(1, num / Math.sqrt(dx * dy)));
}

export function crossAssetBoard(m: MacroSnapshot, q: Record<string, RawQuote>): CrossAssetRow[] {
  const rows: CrossAssetRow[] = [];
  const add = (
    symbol: string, label: string, value: number, unit: string,
    d1: number, correlation: number | null, obs: CrossAssetRow['obs']
  ) => {
    if (!Number.isFinite(value)) return;
    const corrState: CrossAssetRow['corrState'] =
      correlation == null ? 'unknown'
        : Math.abs(correlation) > 0.6 ? 'intact'
        : Math.abs(correlation) > 0.35 ? 'weakening' : 'broken';
    // Round at the boundary: float arithmetic on rate deltas otherwise emits
    // artefacts like 13.999999999999968 straight into the UI.
    const r2 = (v: number) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : 0);
    rows.push({
      symbol, label, value: r2(value), unit,
      d1: r2(d1),
      correlation: correlation == null ? null : Math.round(correlation * 100) / 100,
      corrState, obs,
    });
  };

  // Every correlation below is MEASURED from FRED history against the 10Y
  // real yield (the shared macro anchor), not asserted from memory.
  const anchor = m.hist?.REAL10Y ?? [];
  const rho = (id: string) =>
    id === 'REAL10Y' ? 1 : corrOfChanges(m.hist?.[id] ?? [], anchor);

  add('US2Y', 'US 2-Year', m.us2y, '%', m.us2yChg * 100, rho('US2Y'), 'measured');
  add('US10Y', 'US 10-Year', m.us10y, '%', m.us10yChg * 100, rho('US10Y'), 'measured');
  add('REAL10Y', '10Y Real Yield', m.real10y, '%', m.real10yChg * 100, rho('REAL10Y'), 'measured');
  add('CURVE', '2s10s Curve', m.curve, 'bp', m.curveChg * 100, rho('CURVE'), 'derived');
  add('HYOAS', 'HY Credit OAS', m.hyOas, '%', m.hyOasChg * 100, rho('HYOAS'), 'measured');
  add('VIX', 'VIX', m.vix, '', m.vixChg, rho('VIX'), 'measured');
  add('DXY', 'Broad Dollar', m.dxy, '', m.dxyChg, rho('DXY'), 'measured');
  add('BE10Y', '10Y Breakeven', m.breakeven, '%',
    (m.hist?.BE10Y?.length ?? 0) > 1
      ? (m.hist.BE10Y.at(-1)!.value - m.hist.BE10Y.at(-2)!.value) * 100 : 0,
    rho('BE10Y'), 'measured');

  for (const s of ['XAUUSD', 'XAGUSD', 'NAS100'] as const) {
    const x = q[s];
    if (x) add(s, s === 'NAS100' ? 'Nasdaq 100' : s === 'XAUUSD' ? 'Gold' : 'Silver',
      x.price, '', x.changePct, null, 'measured');
  }
  return rows;
}

// ---------------------------------------------------------------
// ANOMALY ENGINE — flags broken relationships
// ---------------------------------------------------------------
export function detectAnomalies(m: MacroSnapshot, q: Record<string, RawQuote>): Anomaly[] {
  const out: Anomaly[] = [];
  const au = q['XAUUSD'], ag = q['XAGUSD'], nas = q['NAS100'];

  // Gold vs real yields — the canonical relationship
  if (au && Number.isFinite(m.real10yChg)) {
    const bothUp = au.changePct > 0.25 && m.real10yChg > 0.03;
    const bothDown = au.changePct < -0.25 && m.real10yChg < -0.03;
    if (bothUp || bothDown) {
      out.push({
        id: 'gold-real',
        title: 'Gold diverging from real yields',
        detail: `Gold ${au.changePct >= 0 ? '+' : ''}${au.changePct.toFixed(2)}% while 10y real yields moved ${m.real10yChg >= 0 ? '+' : ''}${(m.real10yChg * 100).toFixed(1)}bp.`,
        severity: 'high',
        normalRelation: 'Gold is inversely sensitive to real yields — its opportunity cost.',
        currentBehaviour: bothUp ? 'Both rising together' : 'Both falling together',
        interpretation: 'A non-rates bid is dominant: official-sector demand, fiscal-risk hedging or de-dollarisation flow. The real-yield model is not the marginal buyer today.',
        obs: 'derived',
      });
    }
  }

  // Gold/silver ratio divergence
  if (au && ag) {
    const gap = au.changePct - ag.changePct;
    if (Math.abs(gap) > 0.9) {
      out.push({
        id: 'gsr',
        title: 'Gold/silver ratio moving sharply',
        detail: `Gold ${au.changePct >= 0 ? '+' : ''}${au.changePct.toFixed(2)}% vs silver ${ag.changePct >= 0 ? '+' : ''}${ag.changePct.toFixed(2)}% — a ${Math.abs(gap).toFixed(2)}pt spread.`,
        severity: 'medium',
        normalRelation: 'Silver typically runs 1.5–2.5× gold beta in the same direction.',
        currentBehaviour: gap > 0 ? 'Gold leading, silver lagging' : 'Silver leading, gold lagging',
        interpretation: gap > 0
          ? 'Defensive monetary demand rather than broad precious-metals or industrial appetite.'
          : 'Industrial/risk appetite expanding — precious-metals beta rather than a pure haven bid.',
        obs: 'derived',
      });
    }
  }

  // Equities vs credit
  if (nas && Number.isFinite(m.hyOasChg)) {
    if (nas.changePct > 0.5 && m.hyOasChg > 0.1) {
      out.push({
        id: 'eq-credit',
        title: 'Equities rallying while credit widens',
        detail: `NDX ${nas.changePct >= 0 ? '+' : ''}${nas.changePct.toFixed(2)}% with HY OAS ${m.hyOasChg >= 0 ? '+' : ''}${(m.hyOasChg * 100).toFixed(0)}bp wider.`,
        severity: 'high',
        normalRelation: 'Credit typically leads equity. Widening spreads with rising equity is unstable.',
        currentBehaviour: 'Divergent',
        interpretation: 'Credit has historically been the more reliable signal. Treat equity strength with caution.',
        obs: 'derived',
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------
// WHAT CHANGED
// ---------------------------------------------------------------
export function whatChanged(m: MacroSnapshot, r: RegimeState): WhatChanged[] {
  const out: WhatChanged[] = [];
  const bp = (v: number) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}bp`;

  if (Math.abs(m.us2yChg) > 0.015) out.push({
    field: 'US 2-Year Yield',
    from: `${(m.us2y - m.us2yChg).toFixed(3)}%`, to: `${m.us2y.toFixed(3)}%`,
    direction: m.us2yChg > 0 ? 'up' : 'down',
    reason: `Moved ${bp(m.us2yChg)} — the primary FX transmission channel.`,
  });

  if (Math.abs(m.real10yChg) > 0.015) out.push({
    field: '10Y Real Yield',
    from: `${(m.real10y - m.real10yChg).toFixed(3)}%`, to: `${m.real10y.toFixed(3)}%`,
    direction: m.real10yChg > 0 ? 'up' : 'down',
    reason: `${bp(m.real10yChg)} — directly repriced gold's opportunity cost.`,
  });

  if (Math.abs(m.hyOasChg) > 0.06) out.push({
    field: 'HY Credit Spread',
    from: `${(m.hyOas - m.hyOasChg).toFixed(2)}%`, to: `${m.hyOas.toFixed(2)}%`,
    direction: m.hyOasChg > 0 ? 'up' : 'down',
    reason: m.hyOasChg > 0 ? 'Widening — risk appetite deteriorating.' : 'Tightening — risk appetite improving.',
  });

  if (Math.abs(m.vixChg) > 0.7) out.push({
    field: 'VIX',
    from: `${(m.vix - m.vixChg).toFixed(2)}`, to: `${m.vix.toFixed(2)}`,
    direction: m.vixChg > 0 ? 'up' : 'down',
    reason: `Volatility regime: ${r.vol}. ${r.vol === 'compressed' ? 'Mean-reversion setups favoured.' : 'Trend and breakout setups favoured.'}`,
  });

  return out;
}

// ---------------------------------------------------------------
// COMPOSED MARKET STATE
// ---------------------------------------------------------------
export async function marketState() {
  const symbols = ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'XAGUSD', 'NAS100'];
  const [m, q, cot, cal] = await Promise.all([macroSnapshot(), quotes(symbols), cotSnapshot(), calendar()]);
  const regime = classifyRegime(m, q);

  // PRICE-STRUCTURE regime, per instrument. Distinct from `regime` above,
  // which is the macro risk-on/off read. Research showed identical signals
  // returning -0.07R in chop_high vs -0.81R in trend_low, so structure is
  // a first-class input to thesis quality, not a cosmetic label.
  const priceRegimes: Record<string, PriceRegime | null> = {};
  await Promise.all(symbols.map(async sym => {
    try {
      const h = await history(sym, '1y');
      const closes = (h ?? []).map(b => b.close).filter(Number.isFinite);
      priceRegimes[sym] = closes.length > 80 ? classifyPriceRegime(closes, 20) : null;
    } catch {
      priceRegimes[sym] = null;
    }
  }));

  return {
    macro: m,
    quotes: q,
    cot,
    regime,
    priceRegimes,
    calendar: cal,
    crossAsset: crossAssetBoard(m, q),
    anomalies: detectAnomalies(m, q),
    changed: whatChanged(m, regime),
    dataConfidence: computeDataConfidence(m, q),
    generatedAt: new Date().toISOString(),
  };
}

export function computeDataConfidence(m: MacroSnapshot, q: Record<string, RawQuote>): number {
  let score = 0, total = 0;
  const check = (ok: boolean, w: number) => { total += w; if (ok) score += w; };
  check(Number.isFinite(m.us2y), 3);
  check(Number.isFinite(m.real10y), 3);
  check(Number.isFinite(m.hyOas), 2);
  check(Number.isFinite(m.vix), 2);
  check(Number.isFinite(m.dxy), 1);
  check(Object.keys(q).length >= 5, 4);
  check(Object.keys(q).length === 6, 1);
  return Math.round((score / (total || 1)) * 100);
}

export type MarketState = Awaited<ReturnType<typeof marketState>>;
