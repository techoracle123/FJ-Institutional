// ============================================================
// FJ INSTITUTIONAL — DOMAIN MODEL
// The twelve causal layers, observability grading, thesis lifecycle.
// ============================================================

/** How much we actually know about a datum. Displayed everywhere. */
export type Observability = 'measured' | 'derived' | 'inferred' | 'modelled';

export const OBSERVABILITY_META: Record<Observability, { label: string; short: string; color: string; desc: string }> = {
  measured: { label: 'Measured', short: 'M', color: 'var(--color-measured)', desc: 'Direct observation of the actual quantity' },
  derived:  { label: 'Derived',  short: 'D', color: 'var(--color-derived)',  desc: 'Deterministic computation from measured data' },
  inferred: { label: 'Inferred', short: 'I', color: 'var(--color-inferred)', desc: 'Statistical estimate from proxies — genuine uncertainty' },
  modelled: { label: 'Modelled', short: 'X', color: 'var(--color-modelled)', desc: 'Reconstruction of something we fundamentally cannot see' },
};

/** The causal chain. Ordered by transmission, not by category. */
export type LayerId =
  | 'information' | 'surprise' | 'repricing' | 'valuation'
  | 'positioning' | 'flow' | 'liquidity' | 'derivatives'
  | 'systematic' | 'crossasset' | 'forced' | 'reflexivity';

export interface LayerMeta { id: LayerId; n: number; name: string; question: string; obs: Observability }

export const LAYERS: LayerMeta[] = [
  { id: 'information', n: 1,  name: 'Information',  question: 'What arrived?',                          obs: 'measured' },
  { id: 'surprise',    n: 2,  name: 'Surprise',     question: 'How far from what was priced?',          obs: 'measured' },
  { id: 'repricing',   n: 3,  name: 'Repricing',    question: 'What did rates and the curve do?',       obs: 'measured' },
  { id: 'valuation',   n: 4,  name: 'Valuation',    question: 'What should it be worth now?',           obs: 'derived'  },
  { id: 'positioning', n: 5,  name: 'Positioning',  question: 'Who is exposed, and how vulnerable?',    obs: 'measured' },
  { id: 'flow',        n: 6,  name: 'Flow',         question: 'Who has to transact regardless?',        obs: 'derived'  },
  { id: 'liquidity',   n: 7,  name: 'Liquidity',    question: 'How much opposing depth exists?',        obs: 'inferred' },
  { id: 'derivatives', n: 8,  name: 'Derivatives',  question: 'Does hedging amplify or dampen?',        obs: 'modelled' },
  { id: 'systematic',  n: 9,  name: 'Systematic',   question: 'Are model triggers nearby?',             obs: 'inferred' },
  { id: 'crossasset',  n: 10, name: 'Cross-Asset',  question: 'Do related markets confirm?',            obs: 'measured' },
  { id: 'forced',      n: 11, name: 'Forced Flow',  question: 'Is anyone being liquidated?',            obs: 'modelled' },
  { id: 'reflexivity', n: 12, name: 'Reflexivity',  question: 'Is the move feeding itself?',            obs: 'inferred' },
];

/** −3…+3 relative to the thesis direction. 0 = neutral, null = no read. */
export interface LayerReading {
  id: LayerId;
  score: number | null;
  obs: Observability;
  headline: string;
  detail: string;
  /** Machine-checkable facts backing the headline. The LLM may never invent these. */
  evidence: { label: string; value: string; obs: Observability }[];
}

export type Direction = 'long' | 'short' | 'none';
export type Conviction = 'A+' | 'A' | 'B' | 'C';
export type ThesisClass = 'intraday' | 'swing' | 'position' | 'event';
export type LifecycleState = 'watching' | 'forming' | 'confirmed' | 'active' | 't1' | 't2' | 'invalidated' | 'expired';
export type EntryQuality = 'early' | 'confirmed' | 'optimal' | 'late' | 'exhausted';
export type ModelHealth = 'normal' | 'degraded' | 'suspended';

export const CLASS_META: Record<ThesisClass, { label: string; hold: string; tf: string }> = {
  intraday: { label: 'Intraday', hold: '2–8 hours',  tf: 'M15 / H1' },
  swing:    { label: 'Swing',    hold: '2–5 days',   tf: 'H4 / D1'  },
  position: { label: 'Position', hold: '2–6 weeks',  tf: 'D1 / W1'  },
  event:    { label: 'Event',    hold: '30m–48h',    tf: 'M15 / H1' },
};

export const CONVICTION_META: Record<Conviction, { label: string; color: string; bars: number }> = {
  'A+': { label: 'Exceptional alignment', color: 'var(--color-accent)', bars: 4 },
  'A':  { label: 'Strong alignment',      color: 'var(--color-accent)', bars: 3 },
  'B':  { label: 'Tradable, imperfect',   color: 'var(--color-warn)',   bars: 2 },
  'C':  { label: 'Weak edge',             color: 'var(--color-neutral)',bars: 1 },
};

export const ENTRY_META: Record<EntryQuality, { label: string; color: string; note: string }> = {
  early:     { label: 'Early',     color: 'var(--color-warn)',    note: 'Thesis forming — price has not confirmed' },
  confirmed: { label: 'Confirmed', color: 'var(--color-accent)',  note: 'Evidence aligned, structure confirmed' },
  optimal:   { label: 'Optimal',   color: 'var(--color-long)',    note: 'Risk/reward and confirmation strongest here' },
  late:      { label: 'Late',      color: 'var(--color-warn)',    note: 'Move extended — expected value reduced' },
  exhausted: { label: 'Exhausted', color: 'var(--color-short)',   note: 'Do not chase. Wait for retracement.' },
};

export interface PriceLevel { label: string; price: number; kind: 'entry' | 'stop' | 't1' | 't2' | 'level' }

export interface Analogue {
  n: number; hitRate: number; medianMFE: number; medianMAE: number;
  medianHoldHours: number; worst: number; bestRegime: string;
}

export interface Thesis {
  id: string;
  symbol: string;
  direction: Direction;
  klass: ThesisClass;
  conviction: Conviction;
  /** Calibrated. Always with interval + sample size. Never bare. */
  probability: number;
  probabilityCI: number;
  dataConfidence: number;
  modelHealth: ModelHealth;
  modelVersion: string;
  freshness: number;
  lifecycle: LifecycleState;
  entryQuality: EntryQuality;

  entryLow: number; entryHigh: number; stop: number; t1: number; t2: number;
  rr: number; expectedValue: number;

  issuedAt: string; expiresAt: string; expectedHold: string;

  headline: string;
  narrative: string;
  invalidation: string[];
  whyNow: string[];
  mainRisk: string;

  layers: LayerReading[];
  analogue: Analogue;

  catalyst?: { name: string; inMinutes: number; impact: 'extreme' | 'high' | 'medium' | 'low' };
  accelerationRisk: 'high' | 'medium' | 'low';
  accelerationWhy: string;
}

// ---------- Regime ----------
export type RiskRegime = 'risk-on' | 'neutral' | 'risk-off' | 'crisis' | 'risk-off-transition';
export type VolRegime = 'compressed' | 'normal' | 'expanded' | 'stressed';
export type DollarRegime = 'bullish' | 'neutral' | 'bearish' | 'strongly-bearish' | 'strongly-bullish';
export type LiquidityRegime = 'expanding' | 'stable' | 'contracting' | 'stressed';

export interface RegimeState {
  risk: RiskRegime; riskConfidence: number;
  vol: VolRegime; volConfidence: number;
  dollar: DollarRegime; dollarConfidence: number;
  liquidity: LiquidityRegime; liquidityConfidence: number;
  drivers: { name: string; weight: number; direction: 'supports' | 'opposes' }[];
  dominantDriver: string;
  dominantDriverStrength: number;
  narrative: string;
  previousNarrative: string;
  narrativeConfidence: number;
  narrativeShift: 'accelerating' | 'stable' | 'fading';
}

// ---------- Move Autopsy ----------
export interface Attribution { channel: string; pct: number; confidence: 'high' | 'medium' | 'low'; obs: Observability }
export interface ChainEvent { time: string; text: string; emphasis?: boolean }

export interface MoveAutopsy {
  symbol: string; changePct: number; window: string;
  classification: string;
  catalyst: string; transmission: string; amplifier: string; brake: string;
  attribution: Attribution[];
  unexplained: number;
  chain: ChainEvent[];
  didNotConfirm: string[];
  isItDone: string;
  analogue: { n: number; stabilisedPct: number; medianRetrace: number; window: string };
}

// ---------- Market data ----------
export interface Quote {
  symbol: string; name: string; price: number; change: number; changePct: number;
  high: number; low: number; open: number; prevClose: number;
  spread?: number; atr?: number; updatedAt: string; stale?: boolean;
}

export interface CrossAssetRow {
  symbol: string; label: string; value: number; unit: string;
  d1: number;
  /** Measured correlation of daily changes vs 10Y real yield; null if not enough data. */
  correlation: number | null; corrState: 'intact' | 'weakening' | 'broken' | 'unknown';
  obs: Observability;
}

export interface CalendarEvent {
  id: string; time: string; date: string; country: string; name: string;
  impact: 'extreme' | 'high' | 'medium' | 'low';
  consensus: string | null; previous: string | null; actual: string | null;
  forecastSpread: 'tight' | 'wide' | null;
  affects: string[];
  historicalMove: { symbol: string; avgAbsMove: number }[];
  impliedMove: number | null;
  standDown: boolean;
  mechanical?: boolean;
}

export interface WhatChanged { field: string; from: string; to: string; direction: 'up' | 'down' | 'neutral'; reason: string }

export interface Anomaly {
  id: string; title: string; detail: string;
  severity: 'high' | 'medium' | 'low';
  normalRelation: string; currentBehaviour: string; interpretation: string;
  obs: Observability;
}

export interface Instrument {
  symbol: string; display: string; name: string;
  klass: 'fx' | 'metal' | 'index';
  pip: number; digits: number;
  tvSymbol: string;
  drivers: string[];
  /** Typical all-in retail spread in price units — used for cost-adjusted EV. */
  spreadEst: number;
}

export const INSTRUMENTS: Instrument[] = [
  { symbol: 'EURUSD', display: 'EUR/USD', name: 'Euro / US Dollar',       klass: 'fx',    pip: 0.0001, digits: 5, tvSymbol: 'FX:EURUSD',    spreadEst: 0.00008, drivers: ['US–DE 2y spread', 'Fed vs ECB path', 'USD positioning'] },
  { symbol: 'GBPUSD', display: 'GBP/USD', name: 'Pound / US Dollar',      klass: 'fx',    pip: 0.0001, digits: 5, tvSymbol: 'FX:GBPUSD',    spreadEst: 0.00011, drivers: ['US–UK 2y spread', 'BoE path', 'UK fiscal risk'] },
  { symbol: 'USDJPY', display: 'USD/JPY', name: 'US Dollar / Yen',        klass: 'fx',    pip: 0.01,   digits: 3, tvSymbol: 'FX:USDJPY',    spreadEst: 0.010, drivers: ['US–JP 10y spread', 'BoJ normalisation', 'Carry & vol'] },
  { symbol: 'XAUUSD', display: 'XAU/USD', name: 'Gold Spot',              klass: 'metal', pip: 0.1,    digits: 2, tvSymbol: 'OANDA:XAUUSD', spreadEst: 0.28, drivers: ['10y real yield', 'Official-sector demand', 'DXY'] },
  { symbol: 'XAGUSD', display: 'XAG/USD', name: 'Silver Spot',            klass: 'metal', pip: 0.01,   digits: 3, tvSymbol: 'OANDA:XAGUSD', spreadEst: 0.030, drivers: ['Gold beta', 'Industrial demand', 'By-product supply'] },
  { symbol: 'NAS100', display: 'NAS100',  name: 'Nasdaq 100 Index',       klass: 'index', pip: 1,      digits: 1, tvSymbol: 'NASDAQ:NDX',   spreadEst: 1.6, drivers: ['10y real yield', 'Mega-cap earnings', 'Dealer gamma'] },
];

export const bySymbol = (s: string) => INSTRUMENTS.find(i => i.symbol === s);
