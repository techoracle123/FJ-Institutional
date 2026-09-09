// ============================================================
// DATA ROUTER — provider abstraction with quota accounting + fallback.
// The app must never depend on one free tier being up.
// ============================================================

import CAL_DATA from '../data/calendar.json';
const FRED_KEY = process.env.FRED_API_KEY ?? '';
const TD_KEY = process.env.TWELVEDATA_API_KEY ?? '';

type CacheEntry = { data: unknown; expires: number };
const cache = new Map<string, CacheEntry>();

function getCache<T>(k: string): T | null {
  const e = cache.get(k);
  if (!e || Date.now() > e.expires) return null;
  return e.data as T;
}
function setCache(k: string, data: unknown, ttlSec: number) {
  cache.set(k, { data, expires: Date.now() + ttlSec * 1000 });
}

async function fetchJSON<T>(
  url: string,
  opts: { timeoutMs?: number; headers?: Record<string, string>; revalidate?: number } = {}
): Promise<T | null> {
  // `revalidate` maps to Cloudflare's edge cache. The in-process Map cache is
  // useless across isolates — every cold request was refetching all 11 FRED
  // series, costing ~9s on /api/state. Slow-moving data must be cached at the
  // edge, not just in memory.
  const { timeoutMs = 9000, headers, revalidate = 0 } = opts;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers, next: { revalidate } });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// ---------------------------------------------------------------
// FRED — the macro backbone
// ---------------------------------------------------------------
export interface FredPoint { date: string; value: number }

let fredMirror: Record<string, FredPoint[]> | null = null;
let fredMirrorAt = 0;

/**
 * Load the FRED mirror published by scripts/fetch-fred.mjs.
 *
 * FRED's Akamai WAF 403s a subset of Cloudflare edge IPs — per-colo, so
 * in-Worker retries cannot fix it. Measured ~50% of /api/state requests lost
 * the whole macro block and suppressed every thesis. The mirror is refreshed
 * hourly by GitHub Actions (runners are not blocked) and read over the same
 * contents API the ledger uses.
 */
async function loadFredMirror(): Promise<Record<string, FredPoint[]> | null> {
  if (fredMirror && Date.now() - fredMirrorAt < 900_000) return fredMirror;

  const token = process.env.GITHUB_TOKEN ?? '';
  const repo = 'techoracle123/FJ-Institutional';
  try {
    const r = token
      ? await fetch(`https://api.github.com/repos/${repo}/contents/data/fred.json`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github.raw',
            'User-Agent': 'FJInstitutional',
          },
          next: { revalidate: 900 },
        })
      : await fetch(`https://raw.githubusercontent.com/${repo}/main/data/fred.json`,
          { next: { revalidate: 900 } });
    if (r.ok) {
      const j = (await r.json()) as { series?: Record<string, FredPoint[]> };
      if (j?.series && Object.keys(j.series).length) {
        fredMirror = j.series;
        fredMirrorAt = Date.now();
        return fredMirror;
      }
    }
  } catch {
    /* fall through to live FRED */
  }
  return fredMirror; // stale beats nothing
}

export async function fredSeries(id: string, limit = 260): Promise<FredPoint[]> {
  const key = `fred:${id}:${limit}`;
  const hit = getCache<FredPoint[]>(key);
  if (hit) return hit;

  // Mirror first — it is the reliable path from the edge.
  const mirror = await loadFredMirror();
  const m = mirror?.[id];
  if (m?.length) {
    const out = m.slice(0, limit);
    setCache(key, out, 1800);
    return out;
  }

  // Live FRED as fallback (works from unblocked colos and in local dev).
  if (!FRED_KEY) return [];
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${FRED_KEY}&file_type=json&limit=${limit}&sort_order=desc`;
  const j = await fetchJSON<{ observations?: { date: string; value: string }[] }>(
    url, { revalidate: 1800, timeoutMs: 15000 });
  if (!j?.observations) return [];

  const out = j.observations
    .filter(o => o.value !== '.' && o.value !== '')
    .map(o => ({ date: o.date, value: parseFloat(o.value) }))
    .filter(o => Number.isFinite(o.value));

  setCache(key, out, 1800);
  return out;
}

/** Latest value + change over N observations back. */
export async function fredLatest(id: string, lookback = 5) {
  // 250 obs: correlations need >=30 aligned daily changes, and series
  // have differing holiday calendars, so fetch a full year of history.
  const s = await fredSeries(id, Math.max(lookback + 2, 250));
  if (!s.length) return null;
  const latest = s[0];
  const prior = s[Math.min(lookback, s.length - 1)];
  return {
    value: latest.value,
    date: latest.date,
    change: latest.value - prior.value,
    priorDate: prior.date,
    series: s.slice(0, 90).reverse(),
  };
}

/** The macro series that actually matter. */
export const FRED_IDS = {
  US2Y: 'DGS2',
  US10Y: 'DGS10',
  US30Y: 'DGS30',
  REAL10Y: 'DFII10',        // TIPS 10y — the gold anchor
  REAL5Y: 'DFII5',
  BREAKEVEN10Y: 'T10YIE',
  CURVE_2S10S: 'T10Y2Y',
  HY_OAS: 'BAMLH0A0HYM2',   // high-yield spread — risk regime
  IG_OAS: 'BAMLC0A0CM',
  VIX: 'VIXCLS',
  DXY: 'DTWEXBGS',          // broad dollar
  FED_FUNDS: 'DFF',
  SOFR: 'SOFR',
  FED_BS: 'WALCL',          // Fed balance sheet
  TGA: 'WTREGEN',           // Treasury general account
  RRP: 'RRPONTSYD',         // reverse repo
  CPI: 'CPIAUCSL',
  CORE_CPI: 'CPILFESL',
  PCE: 'PCEPI',
  CORE_PCE: 'PCEPILFE',
  UNEMP: 'UNRATE',
  NFP: 'PAYEMS',
  CLAIMS: 'ICSA',
  DE2Y: 'IRLTLT01DEM156N',
} as const;

// ---------------------------------------------------------------
// Prices — Twelve Data primary
// ---------------------------------------------------------------
const TD_MAP: Record<string, string> = {
  EURUSD: 'EUR/USD', GBPUSD: 'GBP/USD', USDJPY: 'USD/JPY',
  XAUUSD: 'XAU/USD', XAGUSD: 'XAG/USD', NAS100: 'IXIC',
  AUDUSD: 'AUD/USD', USDCAD: 'USD/CAD', USDCHF: 'USD/CHF', NZDUSD: 'NZD/USD',
};

export interface RawQuote {
  symbol: string; price: number; change: number; changePct: number;
  high: number; low: number; open: number; prevClose: number;
  source: string; ok: boolean;
}

export async function quote(symbol: string): Promise<RawQuote | null> {
  const key = `q:${symbol}`;
  const hit = getCache<RawQuote>(key);
  if (hit) return hit;

  // Yahoo is PRIMARY. It has no key, no quota, and covers all six instruments
  // including silver and the Nasdaq future. Twelve Data's free tier allows
  // only 8 requests/minute in total — polling six symbols exhausts it
  // immediately and returns 429, which is what silently degraded the feed.
  const y = await yahooQuote(symbol);
  if (y) { setCache(key, y, 45); return y; }

  // Fallback: Twelve Data, used only when Yahoo fails for a symbol.
  const td = TD_MAP[symbol];
  if (td && TD_KEY) {
    const j = await fetchJSON<Record<string, string>>(
      `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(td)}&apikey=${TD_KEY}`
    );
    if (j && j.close) {
      const q: RawQuote = {
        symbol,
        price: parseFloat(j.close),
        change: parseFloat(j.change ?? '0'),
        changePct: parseFloat(j.percent_change ?? '0'),
        high: parseFloat(j.high ?? j.close),
        low: parseFloat(j.low ?? j.close),
        open: parseFloat(j.open ?? j.close),
        prevClose: parseFloat(j.previous_close ?? j.close),
        source: 'twelvedata',
        ok: true,
      };
      if (Number.isFinite(q.price)) { setCache(key, q, 60); return q; }
    }
  }
  return null;
}

const YF_MAP: Record<string, string> = {
  EURUSD: 'EURUSD=X', GBPUSD: 'GBPUSD=X', USDJPY: 'JPY=X',
  XAUUSD: 'GC=F', XAGUSD: 'SI=F', NAS100: 'NQ=F',
  AUDUSD: 'AUDUSD=X', USDCAD: 'USDCAD=X', USDCHF: 'USDCHF=X', NZDUSD: 'NZDUSD=X',
};

interface YahooChart {
  chart?: { result?: { meta?: Record<string, number | string> }[] };
}

async function yahooQuote(symbol: string): Promise<RawQuote | null> {
  const yf = YF_MAP[symbol];
  if (!yf) return null;
  // interval=1m&range=1d gives an accurate *intraday* previous close.
  // interval=1d&range=5d returns a stale weekly close for some FX symbols
  // (JPY=X reported 160.196, producing a fabricated -4% daily move).
  const j = await fetchJSON<YahooChart>(
    `https://query1.finance.yahoo.com/v8/finance/chart/${yf}?interval=1m&range=1d`,
    { revalidate: 45, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FJInstitutional/1.0)' } }
  );
  const m = j?.chart?.result?.[0]?.meta;
  if (!m) return null;

  const price = Number(m.regularMarketPrice);
  const prev = Number(m.chartPreviousClose ?? m.previousClose ?? price);
  if (!Number.isFinite(price) || price <= 0) return null;

  const change = price - prev;
  return {
    symbol,
    price,
    change,
    changePct: prev ? (change / prev) * 100 : 0,
    high: Number(m.regularMarketDayHigh) || price,
    low: Number(m.regularMarketDayLow) || price,
    open: Number(m.regularMarketOpen) || prev,
    prevClose: prev,
    source: 'yahoo',
    ok: true,
  };
}

export async function quotes(symbols: string[]): Promise<Record<string, RawQuote>> {
  const results = await Promise.all(symbols.map(s => quote(s).then(q => [s, q] as const)));
  const out: Record<string, RawQuote> = {};
  for (const [s, q] of results) if (q) out[s] = q;
  return out;
}

/** Time series for charts. */
export async function series(symbol: string, interval = '1h', size = 220) {
  const key = `ts:${symbol}:${interval}:${size}`;
  const hit = getCache<{ time: number; open: number; high: number; low: number; close: number }[]>(key);
  if (hit) return hit;

  const td = TD_MAP[symbol];
  if (!td || !TD_KEY) return [];

  const j = await fetchJSON<{ values?: { datetime: string; open: string; high: string; low: string; close: string }[] }>(
    `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(td)}&interval=${interval}&outputsize=${size}&apikey=${TD_KEY}`
  );
  if (!j?.values) return [];

  const out = j.values
    .map(v => ({
      time: Math.floor(new Date(v.datetime.replace(' ', 'T') + 'Z').getTime() / 1000),
      open: parseFloat(v.open), high: parseFloat(v.high),
      low: parseFloat(v.low), close: parseFloat(v.close),
    }))
    .filter(v => Number.isFinite(v.close) && Number.isFinite(v.time))
    .sort((a, b) => a.time - b.time);

  setCache(key, out, 300);
  return out;
}

// ---------------------------------------------------------------
// CFTC COT — free, weekly, criminally underused
// ---------------------------------------------------------------
export interface CotRow { symbol: string; netNonComm: number; pct3y: number; changeWk: number; asOf: string }

export async function cotSnapshot(): Promise<CotRow[]> {
  const key = 'cot:snap';
  const hit = getCache<CotRow[]>(key);
  if (hit) return hit;

  // Socrata endpoint — public, no key required.
  const j = await fetchJSON<Record<string, string>[]>(
    'https://publicreporting.cftc.gov/resource/6dca-aqww.json?$limit=400&$order=report_date_as_yyyy_mm_dd%20DESC',
    { revalidate: 3600, timeoutMs: 12000 });  // COT publishes weekly

  if (!j?.length) return [];

  const WANT: Record<string, string> = {
    'EURO FX': 'EURUSD', 'BRITISH POUND': 'GBPUSD', 'JAPANESE YEN': 'USDJPY',
    'GOLD': 'XAUUSD', 'SILVER': 'XAGUSD', 'NASDAQ-100': 'NAS100',
    'AUSTRALIAN DOLLAR': 'AUDUSD', 'CANADIAN DOLLAR': 'USDCAD',
    'SWISS FRANC': 'USDCHF', 'NZ DOLLAR': 'NZDUSD',
  };

  const seen = new Set<string>();
  const out: CotRow[] = [];
  for (const r of j) {
    const nm = (r.market_and_exchange_names ?? '').toUpperCase();
    const matchKey = Object.keys(WANT).find(k => nm.startsWith(k));
    if (!matchKey) continue;
    const sym = WANT[matchKey];
    if (seen.has(sym)) continue;
    seen.add(sym);

    const long = parseFloat(r.noncomm_positions_long_all ?? '0');
    const short = parseFloat(r.noncomm_positions_short_all ?? '0');
    const chgL = parseFloat(r.change_in_noncomm_long_all ?? '0');
    const chgS = parseFloat(r.change_in_noncomm_short_all ?? '0');
    if (!Number.isFinite(long) || !Number.isFinite(short)) continue;

    out.push({
      symbol: sym,
      netNonComm: Math.round(long - short),
      pct3y: NaN, // computed downstream against history
      changeWk: Math.round(chgL - chgS),
      asOf: r.report_date_as_yyyy_mm_dd?.slice(0, 10) ?? '',
    });
  }

  setCache(key, out, 3600 * 6);
  return out;
}

// ---------------------------------------------------------------
// Economic calendar — FRED release dates (free, authoritative).
// We whitelist the releases that actually move our six instruments;
// FRED publishes ~360 releases a fortnight, almost all noise.
// ---------------------------------------------------------------
export interface CalRow {
  time: string; title: string; currency: string;
  impact: 'high' | 'medium' | 'low';
  consensus: number | null; prior: number | null;
  affects: string[];
}

/** Which currencies transmit to which of our instruments. */
const CCY_AFFECTS: Record<string, string[]> = {
  USD: ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'XAGUSD', 'NAS100',
        'AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD'],
  AUD: ['AUDUSD'], CAD: ['USDCAD'], CHF: ['USDCHF'], NZD: ['NZDUSD'],
  EUR: ['EURUSD'],
  GBP: ['GBPUSD'],
  JPY: ['USDJPY'],
};

/**
 * Economic calendar.
 *
 * Sourced from ForexFactory's public weekly JSON feed, which carries real
 * forecast and previous values across every major currency. The earlier
 * FRED release-dates approach was abandoned: it exposed only release *dates*
 * with no consensus figures, and its numeric release IDs did not reliably
 * match our whitelist — the calendar silently returned zero events.
 */
export async function calendar(): Promise<CalRow[]> {
  const key = 'cal:static';
  const hit = getCache<CalRow[]>(key);
  if (hit) return hit;

  // Imported at build time from data/calendar.json, which a scheduled
  // GitHub Action refreshes twice daily. We do NOT fetch the upstream feed
  // here: ForexFactory returns HTTP 429 to Cloudflare's shared egress IPs,
  // so an edge fetch silently yields an empty calendar.
  const now = Date.now() - 3600_000;
  const rows = (CAL_DATA.events as CalRow[])
    .filter(e => new Date(e.time).getTime() >= now)
    .sort((a2, b2) => a2.time.localeCompare(b2.time));

  setCache(key, rows, 900);
  return rows;
}

/** Daily OHLC history for backtesting — Yahoo, no key, multi-year. */
export async function history(symbol: string, range = '5y') {
  const key = `hist:${symbol}:${range}`;
  const hit = getCache<{ time: number; open: number; high: number; low: number; close: number }[]>(key);
  if (hit) return hit;

  const yf = YF_MAP[symbol];
  if (!yf) return [];

  const j = await fetchJSON<{
    chart?: { result?: { timestamp?: number[]; indicators?: { quote?: { open: (number | null)[]; high: (number | null)[]; low: (number | null)[]; close: (number | null)[] }[] } }[] };
  }>(
    `https://query1.finance.yahoo.com/v8/finance/chart/${yf}?interval=1d&range=${range}`,
    // daily bars change once per session
    { revalidate: 3600, timeoutMs: 20000, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FJInstitutional/1.0)' } }
  );

  const r = j?.chart?.result?.[0];
  const q = r?.indicators?.quote?.[0];
  if (!r?.timestamp || !q) return [];

  const out = r.timestamp
    .map((t, i) => ({
      time: t, open: q.open[i]!, high: q.high[i]!, low: q.low[i]!, close: q.close[i]!,
    }))
    .filter(b => [b.open, b.high, b.low, b.close].every(v => typeof v === 'number' && Number.isFinite(v)));

  setCache(key, out, 21600); // 6h
  return out;
}
