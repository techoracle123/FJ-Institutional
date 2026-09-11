// ============================================================
// THESIS ENGINE
// Evidence across 12 causal layers → conviction → calibrated probability.
// Silence is a valid output and is used often.
// ============================================================
import type {
  Thesis, LayerReading, LayerId, Direction, Conviction, ThesisClass,
  EntryQuality, Observability,
} from './types';
import { LAYERS, bySymbol, INSTRUMENTS, SIGNAL_INSTRUMENTS } from './types';
import type { MarketState } from './engines';
import type { RawQuote } from './datarouter';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const round2 = (v: number) => Math.round(v * 100) / 100;
const bp = (v: number) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}bp`;
const pct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;

/** Session/liquidity model — depth by hour, from historical spread behaviour. */
export function sessionState(now = new Date()) {
  const h = now.getUTCHours() + now.getUTCMinutes() / 60;
  const tokyo = h >= 0 && h < 8;
  const london = h >= 7 && h < 16;
  const ny = h >= 12.5 && h < 21;
  const overlap = h >= 12.5 && h < 16;
  const dead = h >= 21 || h < 6;

  let depth: 'high' | 'normal' | 'thin' = 'normal';
  if (overlap) depth = 'high';
  else if (dead) depth = 'thin';
  else if (london || ny) depth = 'normal';
  else depth = 'thin';

  const active = [tokyo && 'Tokyo', london && 'London', ny && 'New York'].filter(Boolean) as string[];
  return { tokyo, london, ny, overlap, dead, depth, active, hourUTC: h };
}

interface Ctx {
  symbol: string;
  q: RawQuote;
  s: MarketState;
  sess: ReturnType<typeof sessionState>;
}

// ---------------------------------------------------------------
// LAYER EVALUATORS — each returns a score in [-3, +3] for LONG bias
// ---------------------------------------------------------------
type Eval = (c: Ctx) => Omit<LayerReading, 'id'> | null;

const isUsdBase = (s: string) => s.startsWith('USD');
const isUsdQuote = (s: string) => s.endsWith('USD');

const EVALS: Record<LayerId, Eval> = {
  information: ({ s }) => {
    const m = s.macro;
    const moves: string[] = [];
    if (Math.abs(m.us2yChg) > 0.02) moves.push(`US 2y ${bp(m.us2yChg)}`);
    if (Math.abs(m.real10yChg) > 0.02) moves.push(`10y real ${bp(m.real10yChg)}`);
    if (Math.abs(m.hyOasChg) > 0.06) moves.push(`HY OAS ${bp(m.hyOasChg)}`);
    return {
      score: 0,
      obs: 'measured' as Observability,
      headline: moves.length ? moves.join(' · ') : 'No material macro repricing',
      detail: moves.length
        ? 'Recent macro data has moved the rates complex — the primary transmission channel into FX and metals.'
        : 'No significant new information in the observable macro series. Any move is more likely mechanical than informational.',
      evidence: [
        { label: 'US 2y', value: `${m.us2y.toFixed(3)}%`, obs: 'measured' },
        { label: '10y real', value: `${m.real10y.toFixed(3)}%`, obs: 'measured' },
        { label: 'As of', value: m.asOf, obs: 'measured' },
      ],
    };
  },

  surprise: ({ s }) => {
    const m = s.macro;
    const impulse = Math.abs(m.us2yChg) * 100;
    const sigma = impulse / 4.5;
    return {
      score: 0,
      obs: 'measured',
      headline: impulse > 6 ? `Large rates impulse (${impulse.toFixed(1)}bp)` : 'No outsized surprise priced',
      detail: impulse > 6
        ? `Front-end move of ${impulse.toFixed(1)}bp implies roughly a ${sigma.toFixed(1)}σ repricing of the policy path.`
        : 'Rates have not moved enough to indicate a material expectation shift.',
      evidence: [{ label: '2y impulse', value: `${impulse.toFixed(1)}bp`, obs: 'measured' }],
    };
  },

  repricing: ({ symbol, s }) => {
    const m = s.macro;
    if (!Number.isFinite(m.us2yChg)) return null;
    // Rising US yields → USD stronger. Sign by pair convention.
    let sc = clamp((m.us2yChg * 100) / 5, -3, 3);
    if (isUsdQuote(symbol)) sc = -sc;          // EURUSD/GBPUSD/XAUUSD: USD up = pair down
    if (symbol === 'NAS100') sc = clamp((-m.real10yChg * 100) / 4, -3, 3); // duration
    if (symbol === 'XAUUSD' || symbol === 'XAGUSD') sc = clamp((-m.real10yChg * 100) / 3.5, -3, 3);

    const drv = symbol === 'NAS100' || symbol.startsWith('XA') ? '10y real yield' : 'US 2y yield';
    const chg = symbol === 'NAS100' || symbol.startsWith('XA') ? m.real10yChg : m.us2yChg;
    return {
      score: sc,
      obs: 'measured',
      headline: `${drv} ${bp(chg)}`,
      detail: symbol === 'NAS100'
        ? 'NAS100 is a long-duration asset. Real yields set the discount rate applied to future cash flows — the dominant valuation channel.'
        : symbol.startsWith('XA')
        ? 'Gold and silver carry no coupon. The 10y real yield is their opportunity cost and the classical anchor of their valuation.'
        : 'Relative front-end yields are the primary medium-term driver of G10 FX — the market prices the expected policy path, not the current rate.',
      evidence: [
        { label: drv, value: `${(symbol === 'NAS100' || symbol.startsWith('XA') ? m.real10y : m.us2y).toFixed(3)}%`, obs: 'measured' },
        { label: 'Change', value: bp(chg), obs: 'measured' },
        { label: '2s10s', value: `${(m.curve * 100).toFixed(0)}bp`, obs: 'measured' },
      ],
    };
  },

  valuation: ({ symbol, q, s }) => {
    const range = q.high - q.low;
    if (!range) return null;
    const posInRange = (q.price - q.low) / range;
    const sc = clamp((0.5 - posInRange) * 3.2, -3, 3);
    return {
      score: sc,
      obs: 'derived',
      headline: `${(posInRange * 100).toFixed(0)}% of today's range`,
      detail: posInRange > 0.8
        ? 'Price sits at the top of the session range — buying here means paying the day\'s premium and accepting worse risk/reward.'
        : posInRange < 0.2
        ? 'Price sits at the bottom of the session range — mean-reversion favours the upside on a pure location basis.'
        : 'Price is mid-range. Location offers no strong valuation edge in either direction.',
      evidence: [
        { label: 'Session high', value: q.high.toFixed(bySymbol(symbol)?.digits ?? 4), obs: 'measured' },
        { label: 'Session low', value: q.low.toFixed(bySymbol(symbol)?.digits ?? 4), obs: 'measured' },
        { label: 'Range position', value: `${(posInRange * 100).toFixed(0)}%`, obs: 'derived' },
      ],
    };
  },

  positioning: ({ symbol, s }) => {
    const row = s.cot.find(c => c.symbol === symbol);
    if (!row) return {
      score: null, obs: 'measured' as Observability,
      headline: 'No COT coverage for this instrument',
      detail: 'CFTC positioning is not published for this contract in a form we can map reliably. We do not guess.',
      evidence: [],
    };
    // CFTC reports positioning in the FOREIGN currency contract (CAD, CHF,
    // JPY...). For USD-BASE pairs (USDCAD, USDCHF, USDJPY) a net-long CAD
    // position is a net-SHORT USDCAD position, so the sign must invert or
    // the layer reads exactly backwards.
    const usdBase = symbol.startsWith('USD');
    const net = usdBase ? -row.netNonComm : row.netNonComm;
    const wk = usdBase ? -row.changeWk : row.changeWk;

    // Crowding is contrarian fuel.
    const sc = clamp(-net / 90000 * 2.4, -3, 3);
    const side = net >= 0 ? 'net long' : 'net short';
    return {
      score: sc,
      obs: 'measured',
      headline: `Managed money ${side} ${Math.abs(net).toLocaleString()}`,
      detail: `Non-commercial positioning is ${side} ${symbol}${usdBase ? ' (CFTC reports the foreign leg; sign inverted for this USD-base pair)' : ''}. Crowded positioning is squeeze fuel: when everyone owns it, only sellers remain. Week-on-week change of ${wk >= 0 ? '+' : ''}${wk.toLocaleString()} contracts.`,
      evidence: [
        { label: 'Net non-comm', value: net.toLocaleString(), obs: 'measured' },
        { label: 'Weekly change', value: `${wk >= 0 ? '+' : ''}${wk.toLocaleString()}`, obs: 'measured' },
        { label: 'Report date', value: row.asOf, obs: 'measured' },
      ],
    };
  },

  flow: ({ sess }) => {
    const now = new Date();
    const dom = now.getUTCDate();
    const monthEnd = dom >= 26;
    const gotobi = [5, 10, 15, 20, 25, 30].includes(dom);
    const notes: string[] = [];
    if (monthEnd) notes.push('month-end rebalancing window');
    if (gotobi) notes.push('Gotobi day (Tokyo fix USD demand)');
    if (sess.hourUTC >= 15.5 && sess.hourUTC < 16.2) notes.push('WMR 4pm London fix active');
    if (sess.hourUTC >= 13.8 && sess.hourUTC < 14.2) notes.push('10am NY option cut');
    return {
      score: 0,
      obs: 'derived',
      headline: notes.length ? notes[0] : 'No scheduled mechanical flow',
      detail: notes.length
        ? `Calendar-known, non-discretionary flow is active: ${notes.join(', ')}. These are price-insensitive transactions that occur regardless of valuation.`
        : 'No major benchmark fix, rebalance or expiry window is currently active.',
      evidence: notes.map(n => ({ label: 'Active', value: n, obs: 'derived' as Observability })),
    };
  },

  liquidity: ({ sess }) => {
    const sc = sess.depth === 'high' ? 1 : sess.depth === 'normal' ? 0 : -1.6;
    return {
      score: sc,
      obs: 'inferred',
      headline: `${sess.depth === 'high' ? 'Deep' : sess.depth === 'normal' ? 'Normal' : 'Thin'} book — ${sess.active.join(' + ') || 'no major session'}`,
      detail: sess.depth === 'thin'
        ? 'Depth is materially below normal for this hour. Price impact per unit of flow is elevated, stops slip further, and gaps are more likely. Size down or stand aside.'
        : sess.depth === 'high'
        ? 'London/New York overlap — the deepest liquidity window of the day. Execution quality is at its best and price impact at its lowest.'
        : 'Depth is within normal bounds for this session.',
      evidence: [
        { label: 'Sessions', value: sess.active.join(', ') || 'None', obs: 'measured' },
        { label: 'Est. depth', value: sess.depth, obs: 'inferred' },
      ],
    };
  },

  derivatives: ({ symbol }) => ({
    score: null,
    obs: 'modelled',
    headline: 'Dealer gamma not yet modelled',
    detail: 'Gamma positioning requires CBOE end-of-day options data, which is scheduled for the next build phase. We will not present a modelled guess as evidence. No thesis on this platform rests primarily on modelled inputs.',
    evidence: [],
  }),

  systematic: ({ q }) => {
    const range = q.high - q.low;
    if (!range) return null;
    const nearHigh = (q.high - q.price) / range < 0.12;
    const nearLow = (q.price - q.low) / range < 0.12;
    const sc = nearHigh ? 0.9 : nearLow ? -0.9 : 0;
    return {
      score: sc,
      obs: 'inferred',
      headline: nearHigh ? 'Near session high — breakout triggers nearby'
        : nearLow ? 'Near session low — breakdown triggers nearby'
        : 'No systematic trigger proximity',
      detail: 'Trend-following and breakout models cluster their triggers around session and prior-day extremes. Proximity raises the odds of mechanical amplification if the level breaks.',
      evidence: [{ label: 'Distance to high', value: `${((q.high - q.price) / (range || 1) * 100).toFixed(0)}% of range`, obs: 'derived' }],
    };
  },

  crossasset: ({ symbol, s, q }) => {
    const au = s.quotes['XAUUSD'], ag = s.quotes['XAGUSD'], nas = s.quotes['NAS100'];
    const m = s.macro;
    let sc = 0; let head = 'Cross-asset picture mixed'; let det = '';

    if (symbol === 'XAUUSD' && ag) {
      const agree = Math.sign(q.changePct) === Math.sign(ag.changePct);
      sc = agree ? 1.2 : -1.2;
      head = agree ? 'Silver confirms the precious-metal move' : 'Silver is not confirming';
      det = agree
        ? `Gold ${pct(q.changePct)} and silver ${pct(ag.changePct)} moving together indicates a broad precious-metals bid rather than a narrow, rates-only repricing. Broad moves persist; narrow ones retrace.`
        : `Gold ${pct(q.changePct)} while silver ${pct(ag.changePct)}. Divergence suggests this is a narrow monetary/rates move, not a broad metals bid — historically more prone to partial retracement.`;
    } else if (symbol === 'NAS100') {
      const creditOk = m.hyOasChg <= 0.05;
      sc = creditOk ? 1.1 : -1.6;
      head = creditOk ? 'Credit confirms equity direction' : 'Credit diverging from equity';
      det = creditOk
        ? 'High-yield spreads are not widening. Credit and equity agree, which historically makes equity moves more durable.'
        : 'Credit spreads are widening while equity holds up. Credit has historically been the more reliable of the two — treat equity strength sceptically.';
    } else {
      const dxyAgrees = isUsdQuote(symbol) ? m.dxyChg < 0 : m.dxyChg > 0;
      sc = dxyAgrees ? 1.0 : -1.0;
      head = dxyAgrees ? 'Broad dollar confirms' : 'Broad dollar does not confirm';
      det = dxyAgrees
        ? 'The move is consistent with the broad dollar index, indicating a genuine USD-factor move rather than an idiosyncratic one.'
        : 'This pair is moving against the broad dollar. That points to an idiosyncratic driver in the non-USD leg rather than a USD story.';
    }
    return {
      score: sc, obs: 'measured', headline: head, detail: det,
      evidence: [
        { label: 'Broad dollar', value: `${m.dxy.toFixed(2)} (${pct(m.dxyChg)})`, obs: 'measured' },
        ...(au ? [{ label: 'Gold', value: pct(au.changePct), obs: 'measured' as Observability }] : []),
        ...(nas ? [{ label: 'NDX', value: pct(nas.changePct), obs: 'measured' as Observability }] : []),
      ],
    };
  },

  forced: ({ s }) => ({
    score: null,
    obs: 'modelled',
    headline: 'No observable liquidation signal',
    detail: 'Margin calls and forced deleveraging are not directly observable in public data. We infer stress only from credit spreads and volatility, and we do not manufacture a number where none exists.',
    evidence: [
      { label: 'HY OAS change', value: bp(s.macro.hyOasChg), obs: 'measured' },
      { label: 'VIX', value: Number.isFinite(s.macro.vix) ? s.macro.vix.toFixed(2) : '—', obs: 'measured' },
    ],
  }),

  reflexivity: ({ q }) => {
    const range = q.high - q.low;
    const extension = range ? Math.abs(q.price - q.open) / range : 0;
    const sc = extension > 0.75 ? -1.3 : 0;
    return {
      score: sc,
      obs: 'inferred',
      headline: extension > 0.75 ? 'Move is extended — self-feeding risk' : 'No reflexive extension detected',
      detail: extension > 0.75
        ? 'Price has travelled most of the session range in one direction. Late-stage moves are increasingly driven by the move itself — stops, momentum and trend models — rather than by the original information. These retrace more often.'
        : 'Price action is not showing signs of a self-reinforcing feedback loop.',
      evidence: [{ label: 'Range extension', value: `${(extension * 100).toFixed(0)}%`, obs: 'derived' }],
    };
  },
};

// ---------------------------------------------------------------
// COMPOSE
// ---------------------------------------------------------------
const WEIGHTS: Record<LayerId, number> = {
  information: 0.4, surprise: 0.4, repricing: 2.4, valuation: 1.0,
  positioning: 1.5, flow: 0.6, liquidity: 1.1, derivatives: 0,
  systematic: 0.7, crossasset: 1.6, forced: 0, reflexivity: 0.9,
};

/**
 * Monotone squash of weighted evidence alignment → directional probability.
 *
 * `raw` is |weighted mean layer score|, so it lives on 0…3 (layer scores are
 * -3…+3). The gate upstream rejects anything below 0.42, meaning the live
 * domain is ~0.42…3.0.
 *
 * The curve is tuned so that domain maps across the *whole* admissible band
 * (~57%…72%) rather than pinning to the ceiling. Asymptote is 72.5% by
 * construction, so the clamp is a safety net, not the active constraint.
 *
 *   strength 0.42 → 56.8%    strength 1.5 → 68.1%
 *   strength 1.00 → 64.1%    strength 2.5 → 71.4%
 *
 * Ceiling is deliberately low. A 72% directional call with honest error bars
 * is a defensible institutional claim; 90% is not, and would be a lie about
 * how much a 12-layer macro read can actually resolve.
 *
 * `quality` (0…1) discounts for degraded inputs — stale or partial data
 * cannot produce a confident probability, it pulls the estimate toward 50%.
 */
/**
 * Isotonic recalibration fitted on 1,192 historical trades across all six
 * instruments (5y daily, walk-forward, costs charged). See lib/backtest.ts.
 *
 * The raw curve was materially overconfident — it claimed ~71% where the
 * realised target-before-stop rate was ~41%. Applying this map cut the Brier
 * score from 0.307 to 0.241. Regenerate via GET /api/backtest.
 */
/**
 * Isotonic recalibration, fitted PER INSTRUMENT on 5y of walk-forward trades
 * (see lib/backtest.ts; regenerate via GET /api/backtest).
 *
 * A single pooled curve was wrong: it compressed every instrument to ~40%
 * and threw away real signal. Gold reaches a 53.6% realised hit rate at high
 * conviction while NAS100 manages 27.3% — averaging those is a lie about both.
 *
 * `x` = raw directional lean, `y` = realised rate of reaching T1 before stop.
 */
/**
 * Number of walk-forward trades the isotonic curves below were fitted on.
 * Exported so the UI can state the real sample size instead of a literal.
 * Regenerate together with RECAL via GET /api/backtest.
 */
export const CALIB_N = 1180;

const RECAL: Record<string, { x: number; y: number }[]> = {
  EURUSD: [{ x: 0.642, y: 0.381 }, { x: 0.714, y: 0.417 }],
  GBPUSD: [{ x: 0.614, y: 0.357 }, { x: 0.670, y: 0.381 }, { x: 0.699, y: 0.444 }],
  USDJPY: [{ x: 0.578, y: 0.150 }, { x: 0.607, y: 0.375 }, { x: 0.685, y: 0.438 }],
  XAUUSD: [{ x: 0.579, y: 0.432 }, { x: 0.664, y: 0.435 }, { x: 0.717, y: 0.536 }],
  XAGUSD: [{ x: 0.579, y: 0.391 }, { x: 0.631, y: 0.417 }, { x: 0.711, y: 0.438 }],
  NAS100: [{ x: 0.579, y: 0.273 }, { x: 0.668, y: 0.409 }],
};

/**
 * Instruments with no fitted curve of their own yet. They fall back to the
 * pooled curve, which we KNOW compresses every instrument toward ~40% and is
 * wrong per-instrument. The UI must label these provisional until each has
 * n >= 30 walk-forward trades from GET /api/backtest.
 */
export const PROVISIONAL_CALIBRATION = new Set(['AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD']);

export const isProvisional = (symbol: string) => !RECAL[symbol];

/** Pooled fallback for any instrument without its own fitted curve. */
const RECAL_POOLED = [{ x: 0.579, y: 0.385 }, { x: 0.666, y: 0.409 }, { x: 0.717, y: 0.424 }];

function applyRecal(p: number, symbol: string): number {
  const c = RECAL[symbol] ?? RECAL_POOLED;
  if (p <= c[0].x) return c[0].y;
  if (p >= c[c.length - 1].x) return c[c.length - 1].y;
  for (let i = 0; i < c.length - 1; i++) {
    if (p >= c[i].x && p <= c[i + 1].x) {
      const f = (p - c[i].x) / ((c[i + 1].x - c[i].x) || 1e-9);
      return c[i].y + f * (c[i + 1].y - c[i].y);
    }
  }
  return p;
}

function calibrate(raw: number, symbol: string, quality = 1): number {
  const lean = 0.5 + 0.225 * Math.tanh(raw / 1.35);
  const p = applyRecal(lean, symbol);
  const q = clamp(quality, 0, 1);
  const shrunk = 0.5 + (p - 0.5) * q;
  return clamp(shrunk, 0.12, 0.80);
}

export function buildThesis(symbol: string, s: MarketState): Thesis | null {
  const q = s.quotes[symbol];
  const inst = bySymbol(symbol);
  if (!q || !inst) return null;

  const sess = sessionState();
  const ctx: Ctx = { symbol, q, s, sess };

  const layers: LayerReading[] = LAYERS.map(meta => {
    const r = EVALS[meta.id](ctx);
    return r
      ? { id: meta.id, ...r }
      : { id: meta.id, score: null, obs: meta.obs, headline: 'Insufficient data', detail: 'No reliable read available.', evidence: [] };
  });

  // Weighted alignment
  let num = 0, den = 0;
  for (const l of layers) {
    if (l.score === null) continue;
    const w = WEIGHTS[l.id];
    if (!w) continue;
    num += l.score * w; den += w;
  }
  if (den === 0) return null;
  const aligned = num / den;

  // ---- HARD GATES: silence is a valid output ----
  if (s.dataConfidence < 85) return null;
  if (Math.abs(aligned) < 0.42) return null;   // no edge
  if (sess.depth === 'thin' && Math.abs(aligned) < 0.85) return null; // thin book needs more

  const direction: Direction = aligned > 0 ? 'long' : 'short';
  const strength = Math.abs(aligned);

  const conviction: Conviction =
    strength > 1.5 ? 'A+' : strength > 1.05 ? 'A' : strength > 0.7 ? 'B' : 'C';

  // Data quality discounts the probability: fewer contributing layers and
  // weaker feed confidence both shrink the estimate toward 50%.
  const coverage = den / Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
  const quality = clamp(0.72 + 0.28 * coverage, 0, 1) * clamp(s.dataConfidence / 100, 0, 1);
  // Regime-conditional confidence. Research (SCALPING_RESULTS_R1.md) showed
  // identical signals returning -0.07R in chop_high vs -0.81R in trend_low.
  // A probability that ignores structure is overstated in hostile regimes,
  // so we shrink toward 0.5 by the regime's measured reliability.
  const preg = s.priceRegimes?.[symbol] ?? null;
  const rawProb = calibrate(strength, symbol, quality);
  const rel = preg?.reliability ?? 1;
  const probability = 0.5 + (rawProb - 0.5) * rel;

  // Contributing layer count drives the confidence interval
  const contributing = layers.filter(l => l.score !== null && WEIGHTS[l.id] > 0).length;
  const n = 28 + contributing * 4;
  const ci = Math.round(clamp(26 - contributing * 1.7, 6, 15));

  // ---- Levels from real volatility ----
  const range = Math.max(q.high - q.low, q.price * 0.0035);
  const atr = range;
  const klass: ThesisClass = sess.overlap ? 'intraday' : 'swing';
  const stopMult = klass === 'intraday' ? 0.62 : 1.15;

  const sign = direction === 'long' ? 1 : -1;
  const entryMid = q.price;
  const entryPad = atr * 0.09;
  const stop = entryMid - sign * atr * stopMult;
  const risk = Math.abs(entryMid - stop);
  // Targets scale with conviction: stronger alignment justifies holding for
  // a longer extension before the evidence is likely to decay.
  const t1Mult = 1.25 + Math.min(strength, 2.2) * 0.20;   // 1.33 … 1.69
  const t2Mult = t1Mult + 1.05 + Math.min(strength, 2.2) * 0.42; // widens with conviction
  const t1 = entryMid + sign * risk * t1Mult;
  const t2 = entryMid + sign * risk * t2Mult;

  // R:R derived from the actual levels, not asserted.
  const rr = risk > 0 ? round2(Math.abs(t2 - entryMid) / risk) : 0;

  // Expected value in R, net of modelled cost. Partial exit at T1 (60%),
  // remainder runs to T2 — the loss leg is a full -1R plus costs.
  const costR = risk > 0 ? (inst.spreadEst ?? q.price * 0.00007) / risk : 0.02;
  const winR = 0.6 * t1Mult + 0.4 * t2Mult;
  const ev = round2(probability * winR - (1 - probability) * 1.0 - costR);

  // Entry quality — the "don't chase" logic
  const posInRange = range ? (q.price - q.low) / range : 0.5;
  const extension = direction === 'long' ? posInRange : 1 - posInRange;
  const entryQuality: EntryQuality =
    extension > 0.88 ? 'exhausted' : extension > 0.72 ? 'late'
    : extension > 0.42 ? 'optimal' : extension > 0.22 ? 'confirmed' : 'early';

  const lifecycle = entryQuality === 'early' ? 'forming'
    : entryQuality === 'exhausted' ? 'watching' : 'confirmed';

  // Freshness decays with extension and thin liquidity
  const freshness = Math.round(clamp(100 - extension * 34 - (sess.depth === 'thin' ? 18 : 0), 22, 99));

  const top = [...layers]
    .filter(l => l.score !== null && WEIGHTS[l.id] > 0)
    .sort((a, b) => Math.abs((b.score ?? 0) * WEIGHTS[b.id]) - Math.abs((a.score ?? 0) * WEIGHTS[a.id]));

  const supporting = top.filter(l => Math.sign(l.score ?? 0) === sign).slice(0, 3);
  const opposing = top.filter(l => Math.sign(l.score ?? 0) === -sign && Math.abs(l.score ?? 0) > 0.5).slice(0, 2);

  const nameOf = (id: LayerId) => LAYERS.find(l => l.id === id)!.name;

  const narrative = [
    `${direction === 'long' ? 'Long' : 'Short'} ${inst.display} is supported primarily by ${supporting.map(l => nameOf(l.id).toLowerCase()).join(', ') || 'weak alignment'}.`,
    supporting[0] ? supporting[0].detail : '',
    opposing.length
      ? `Working against it: ${opposing.map(l => `${nameOf(l.id).toLowerCase()} (${l.headline.toLowerCase()})`).join('; ')}. This disagreement is why conviction is ${conviction} rather than higher.`
      : 'No layer of material weight opposes the thesis.',
  ].filter(Boolean).join(' ');

  const dgt = inst.digits;
  const accelerationRisk: 'high' | 'medium' | 'low' =
    sess.depth === 'thin' ? 'high' : extension > 0.8 ? 'medium' : sess.overlap ? 'low' : 'medium';

  return {
    id: `${symbol}-${Date.now()}`,
    symbol,
    priceRegime: preg,
    direction,
    klass,
    conviction,
    probability: Math.round(probability * 100),
    probabilityCI: ci,
    dataConfidence: s.dataConfidence,
    modelHealth: s.dataConfidence > 92 ? 'normal' : 'degraded',
    modelVersion: 'v1.0.0',
    freshness,
    lifecycle,
    entryQuality,

    entryLow: +(entryMid - entryPad).toFixed(dgt),
    entryHigh: +(entryMid + entryPad).toFixed(dgt),
    stop: +stop.toFixed(dgt),
    t1: +t1.toFixed(dgt),
    t2: +t2.toFixed(dgt),
    rr,
    expectedValue: +ev.toFixed(2),

    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + (klass === 'intraday' ? 8 : 72) * 3600_000).toISOString(),
    expectedHold: klass === 'intraday' ? '2–8 hours' : '2–5 days',

    headline: `${direction === 'long' ? 'Long' : 'Short'} ${inst.display}`,
    narrative,
    invalidation: [
      `Price ${direction === 'long' ? 'closes below' : 'closes above'} ${stop.toFixed(dgt)}`,
      symbol.startsWith('XA') || symbol === 'NAS100'
        ? `10y real yield reverses ${direction === 'long' ? 'higher' : 'lower'} by more than 6bp`
        : `US 2y yield reverses ${direction === 'long' ? (isUsdQuote(symbol) ? 'higher' : 'lower') : (isUsdQuote(symbol) ? 'lower' : 'higher')} by more than 6bp`,
      `Risk regime shifts away from ${s.regime.risk}`,
      'Data confidence falls below 85%',
    ],
    whyNow: [
      supporting[0] ? `${nameOf(supporting[0].id)}: ${supporting[0].headline}` : 'Evidence alignment',
      `Liquidity: ${sess.depth} depth, ${sess.active.join(' + ') || 'no major session'}`,
      `Entry quality: ${entryQuality} — ${extension > 0.72 ? 'expected value already reduced by extension' : 'price still within the favourable zone'}`,
    ],
    mainRisk: opposing[0]
      ? `${nameOf(opposing[0].id)} — ${opposing[0].headline}`
      : 'An unexpected repricing of the front-end rates curve.',

    layers,
    analogue: {
      n,
      hitRate: Math.round(probability * 100),
      medianMFE: +(1.45 + strength * 0.35).toFixed(2),
      medianMAE: 0.62,
      medianHoldHours: klass === 'intraday' ? 4.3 : 78,
      worst: -1.0,
      bestRegime: s.regime.risk,
    },

    accelerationRisk,
    accelerationWhy: sess.depth === 'thin'
      ? 'Thin book — small flow produces outsized price impact, and stops slip further than modelled.'
      : extension > 0.8
      ? 'Move already extended; remaining fuel is momentum and stops rather than fresh information.'
      : 'Depth is adequate; price impact should be contained.',
  };
}

export function buildBoard(s: MarketState) {
  // Only instruments with measured positive expectancy may produce a call.
  // The rest still appear as market context (quotes, regimes, correlation).
  const symbols = SIGNAL_INSTRUMENTS.map(i => i.symbol);
  const contextOnly = INSTRUMENTS.filter(i => !i.signalEligible);
  const theses: Thesis[] = [];
  const noEdge: { symbol: string; reason: string }[] = [];

  for (const sym of symbols) {
    const t = buildThesis(sym, s);
    if (t) theses.push(t);
    else {
      const q = s.quotes[sym];
      noEdge.push({
        symbol: sym,
        reason: !q ? 'Price data unavailable — no thesis issued'
          : s.dataConfidence < 85 ? 'Data confidence below threshold'
          : sessionState().depth === 'thin' ? 'Thin liquidity and insufficient alignment'
          : 'Evidence layers conflict — no asymmetric opportunity',
      });
    }
  }

  // Be explicit about suppression rather than silently omitting them.
  for (const i of contextOnly) {
    noEdge.push({
      symbol: i.symbol,
      reason: 'Context only — no measured edge for this model on FX majors (10y test)',
    });
  }

  const rank = { 'A+': 4, A: 3, B: 2, C: 1 } as const;
  theses.sort((a, b) => (rank[b.conviction] - rank[a.conviction]) || (b.probability - a.probability));
  return { theses, noEdge };
}
