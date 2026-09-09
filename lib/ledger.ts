// ============================================================
// THESIS LEDGER — the platform's memory.
//
// THE PROBLEM THIS SOLVES
// Before this file, `id: ${symbol}-${Date.now()}` in thesis.ts meant every
// page load invented a brand-new thesis and threw it away. There was no
// "the call we published at 14:00" — so nothing could be tracked, recapped,
// or verified. Live tracking, recaps and calibration all depend on memory.
//
// WHY GITHUB, NOT SUPABASE
// Supabase DDL needs a DB password we do not have; the service-role key only
// reaches PostgREST, which cannot run DDL. The ledger is GLOBAL data (the
// same for every user), not per-user data, so it does not need row-level
// security or a relational engine. It is written by a scheduled GitHub
// Action and read over the GitHub contents API: 5,000 req/hr, no CDN lag
// (raw.githubusercontent has a 300s TTL, too stale for live tracking).
// Cost: $0. Manual setup required from the user: none.
//
// IMMUTABILITY
// A thesis is written once and never edited. Every change appends a REVISION.
// Outcomes append too. This is what makes "what did we know at 14:00?"
// answerable, and it is what lets us prove our probabilities are honest
// instead of asking users to take our word for it.
// ============================================================

import type { Direction, Conviction, ThesisClass } from './types';
import type { RegimeId } from './regime';

export type LedgerOutcome =
  | 'open'
  | 'target'        // hit T1
  | 'stop'          // hit invalidation
  | 'expired'       // ran out of time
  | 'ambiguous';    // bar spanned both — we refuse to guess which came first

/** Immutable record of a published thesis. Written once. */
export type LedgerThesis = {
  /** Stable UUID. Survives across polls, unlike `${symbol}-${Date.now()}`. */
  id: string;
  symbol: string;
  direction: Direction;
  klass: ThesisClass;
  conviction: Conviction;
  /** Calibrated probability AT PUBLICATION. Frozen. */
  probability: number;
  /** Prices frozen at emission so pips are measured from a fixed reference. */
  entry: number;
  stop: number;
  target: number;
  rr: number;
  expectedValue: number;
  /** ISO8601 UTC. Always UTC in storage; converted only at render. */
  publishedAt: string;
  expiresAt: string;
  regime: RegimeId | null;
  /** Snapshot of the evidence so post-mortems are not guesswork. */
  evidence: { layer: string; state: string; weight: number }[];
  dataConfidence: number;
  headline: string;
  /** Version of the calibration curve used, so drift is attributable. */
  calibrationVersion: string;
};

/** Append-only change record. Never mutates the parent thesis. */
export type LedgerRevision = {
  thesisId: string;
  at: string;
  kind: 'probability' | 'regime' | 'threat' | 'lifecycle';
  from: string;
  to: string;
  reason: string;
};

/** Live/settled tracking state for one thesis. */
export type LedgerTrack = {
  thesisId: string;
  symbol: string;
  outcome: LedgerOutcome;
  /** Last observed price and when. */
  lastPrice: number;
  lastAt: string;
  /** Unrealised (or final) move from the frozen entry. */
  pips: number;
  r: number;
  /** Maximum favourable / adverse excursion in R — post-trade analytics
   *  that reveal whether stops are too tight or targets too far. */
  mfeR: number;
  maeR: number;
  /** Set when resolved. */
  resolvedAt: string | null;
  /** Structured attribution: which layer broke. Not prose. */
  resolutionReason: string | null;
  /** Number of poll samples, so staleness is visible. */
  samples: number;
};

export type Ledger = {
  updatedAt: string;
  theses: LedgerThesis[];
  revisions: LedgerRevision[];
  tracks: LedgerTrack[];
};

export const EMPTY_LEDGER: Ledger = {
  updatedAt: '1970-01-01T00:00:00.000Z',
  theses: [],
  revisions: [],
  tracks: [],
};

// ---------------------------------------------------------------
// Pip arithmetic. Getting this wrong makes EVERY number on screen wrong,
// so it lives in exactly one place.
// ---------------------------------------------------------------
export const PIP_SIZE: Record<string, number> = {
  EURUSD: 0.0001,
  GBPUSD: 0.0001,
  USDJPY: 0.01,     // JPY pairs are 2-digit pips
  XAUUSD: 0.1,      // gold quotes in 0.1 increments
  XAGUSD: 0.01,
  NAS100: 1.0,      // index points
};

export function toPips(symbol: string, priceDelta: number): number {
  const p = PIP_SIZE[symbol] ?? 0.0001;
  return Math.round((priceDelta / p) * 10) / 10;
}

/** Signed pips in the direction of the trade. */
export function directionalPips(symbol: string, dir: Direction, entry: number, now: number) {
  const raw = dir === 'long' ? now - entry : entry - now;
  return toPips(symbol, raw);
}

/** Progress in R, where 1R = distance from entry to stop. */
export function toR(dir: Direction, entry: number, stop: number, now: number): number {
  const risk = Math.abs(entry - stop);
  if (risk <= 0) return 0;
  const raw = dir === 'long' ? now - entry : entry - now;
  return Math.round((raw / risk) * 1000) / 1000;
}

// ---------------------------------------------------------------
// Read side. Used by the worker at request time.
// ---------------------------------------------------------------

const REPO = 'techoracle123/FJ-Institutional';
const LEDGER_PATH = 'data/ledger.json';

/**
 * Fetch the ledger from GitHub.
 *
 * Uses the contents API rather than raw.githubusercontent because raw has a
 * 300-second CDN TTL — too stale when the tracker polls every 5 minutes.
 * The API reflects a commit immediately and allows 5,000 req/hr authenticated.
 * Falls back to raw (unauthenticated) if no token is configured, and to an
 * empty ledger if both fail, so the site degrades rather than erroring.
 */
export async function fetchLedger(revalidate = 60): Promise<Ledger> {
  const token = process.env.GITHUB_TOKEN ?? '';

  if (token) {
    try {
      const r = await fetch(
        `https://api.github.com/repos/${REPO}/contents/${LEDGER_PATH}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github.raw',
            'User-Agent': 'FJInstitutional',
          },
          next: { revalidate },
        }
      );
      if (r.ok) return (await r.json()) as Ledger;
    } catch {
      /* fall through */
    }
  }

  try {
    const r = await fetch(
      `https://raw.githubusercontent.com/${REPO}/main/${LEDGER_PATH}`,
      { next: { revalidate: Math.max(revalidate, 300) } }
    );
    if (r.ok) return (await r.json()) as Ledger;
  } catch {
    /* fall through */
  }

  return EMPTY_LEDGER;
}

// ---------------------------------------------------------------
// Derived views. Pure functions so they are trivially testable.
// ---------------------------------------------------------------

export function openTracks(l: Ledger): LedgerTrack[] {
  return l.tracks.filter(t => t.outcome === 'open');
}

export function resolvedTracks(l: Ledger): LedgerTrack[] {
  return l.tracks.filter(t => t.outcome !== 'open');
}

export function thesisById(l: Ledger, id: string): LedgerThesis | undefined {
  return l.theses.find(t => t.id === id);
}

/**
 * Live calibration: claimed probability vs realised frequency.
 *
 * This is the honesty engine. Per the user's explicit direction the platform
 * REPORTS divergence but never auto-suspends on it — different regimes
 * legitimately produce different hit rates, so a blended miss is not
 * automatically a fault.
 */
export function calibrationReport(l: Ledger, minN = 10) {
  const done = resolvedTracks(l).filter(t => t.outcome === 'target' || t.outcome === 'stop');
  const buckets = new Map<string, { claimed: number[]; hits: number; n: number }>();

  for (const t of done) {
    const th = thesisById(l, t.thesisId);
    if (!th) continue;
    const band =
      th.probability < 35 ? '<35%' :
      th.probability < 45 ? '35-45%' :
      th.probability < 55 ? '45-55%' : '55%+';
    const b = buckets.get(band) ?? { claimed: [], hits: 0, n: 0 };
    b.claimed.push(th.probability);
    b.n++;
    if (t.outcome === 'target') b.hits++;
    buckets.set(band, b);
  }

  const rows = [...buckets.entries()].map(([band, b]) => ({
    band,
    n: b.n,
    claimed: Math.round(b.claimed.reduce((s, v) => s + v, 0) / b.n),
    realised: Math.round((b.hits / b.n) * 100),
    sufficient: b.n >= minN,
  }));
  rows.sort((a, b) => a.band.localeCompare(b.band));

  const total = done.length;
  const hits = done.filter(t => t.outcome === 'target').length;
  const claimedAvg = done.length
    ? done.reduce((s, t) => s + (thesisById(l, t.thesisId)?.probability ?? 0), 0) / done.length
    : 0;

  return {
    rows,
    total,
    realisedOverall: total ? Math.round((hits / total) * 100) : null,
    claimedOverall: total ? Math.round(claimedAvg) : null,
    /** Backtest baseline for comparison. Never auto-suspends. */
    backtestBaseline: 40.6,
    sufficient: total >= 30,
  };
}

/** Per-regime performance — where an edge actually lives. */
export function regimeReport(l: Ledger) {
  const done = resolvedTracks(l);
  const m = new Map<string, { n: number; hits: number; totalR: number }>();
  for (const t of done) {
    const th = thesisById(l, t.thesisId);
    const key = th?.regime ?? 'unknown';
    const b = m.get(key) ?? { n: 0, hits: 0, totalR: 0 };
    b.n++;
    if (t.outcome === 'target') b.hits++;
    b.totalR += t.r;
    m.set(key, b);
  }
  return [...m.entries()].map(([regime, b]) => ({
    regime,
    n: b.n,
    hitRate: Math.round((b.hits / b.n) * 1000) / 10,
    totalR: Math.round(b.totalR * 100) / 100,
    expectancy: Math.round((b.totalR / b.n) * 1000) / 1000,
    sufficient: b.n >= 20,
  })).sort((a, b) => b.n - a.n);
}
