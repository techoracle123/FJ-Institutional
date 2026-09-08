// ============================================================
// DATA ROUTER — provider abstraction with quota accounting + fallback.
// The app must never depend on one free tier being up.
// ============================================================

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
  opts: { timeoutMs?: number; headers?: Record<string, string> } = {}
): Promise<T | null> {
  const { timeoutMs = 9000, headers } = opts;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers, next: { revalidate: 0 } });
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

export async function fredSeries(id: string, limit = 260): Promise<FredPoint[]> {
  const key = `fred:${id}:${limit}`;
  const hit = getCache<FredPoint[]>(key);
  if (hit) return hit;
  if (!FRED_KEY) return [];

  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${FRED_KEY}&file_type=json&limit=${limit}&sort_order=desc`;
  const j = await fetchJSON<{ observations?: { date: string; value: string }[] }>(url);
  if (!j?.observations) return [];

  const out = j.observations
    .filter(o => o.value !== '.' && o.value !== '')
    .map(o => ({ date: o.date, value: parseFloat(o.value) }))
    .filter(o => Number.isFinite(o.value));

  setCache(key, out, 1800); // 30 min — daily series
  return out;
}

/** Latest value + change over N observations back. */
export async function fredLatest(id: string, lookback = 5) {
  const s = await fredSeries(id, Math.max(lookback + 2, 30));
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

  // Fallback: Yahoo chart endpoint. No key, no quota. Covers what the
  // Twelve Data free tier gates (XAGUSD) or renames (NAS100).
  const y = await yahooQuote(symbol);
  if (y) { setCache(key, y, 60); return y; }
  return null;
}

const YF_MAP: Record<string, string> = {
  EURUSD: 'EURUSD=X', GBPUSD: 'GBPUSD=X', USDJPY: 'JPY=X',
  XAUUSD: 'GC=F', XAGUSD: 'SI=F', NAS100: '%5ENDX',
};

interface YahooChart {
  chart?: { result?: { meta?: Record<string, number | string> }[] };
}

async function yahooQuote(symbol: string): Promise<RawQuote | null> {
  const yf = YF_MAP[symbol];
  if (!yf) return null;
  const j = await fetchJSON<YahooChart>(
    `https://query1.finance.yahoo.com/v8/finance/chart/${yf}?interval=1d&range=5d`,
    { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FJInstitutional/1.0)' } }
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
    'https://publicreporting.cftc.gov/resource/6dca-aqww.json?$limit=400&$order=report_date_as_yyyy_mm_dd%20DESC'
    , { timeoutMs: 12000 });

  if (!j?.length) return [];

  const WANT: Record<string, string> = {
    'EURO FX': 'EURUSD', 'BRITISH POUND': 'GBPUSD', 'JAPANESE YEN': 'USDJPY',
    'GOLD': 'XAUUSD', 'SILVER': 'XAGUSD', 'NASDAQ-100': 'NAS100',
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

/** release_id → [display title, impact, instruments transmitted to] */
const RELEASE_WATCH: Record<number, [string, 'high' | 'medium' | 'low', string[]]> = {
  10:  ['Consumer Price Index (CPI)', 'high',   ['EURUSD', 'USDJPY', 'XAUUSD', 'NAS100']],
  50:  ['Employment Situation (NFP)', 'high',   ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'NAS100']],
  101: ['FOMC Press Release',         'high',   ['EURUSD', 'USDJPY', 'XAUUSD', 'XAGUSD', 'NAS100']],
  53:  ['Gross Domestic Product',     'high',   ['EURUSD', 'NAS100']],
  46:  ['Producer Price Index (PPI)', 'medium', ['XAUUSD', 'NAS100']],
  24:  ['Personal Income & Outlays (PCE)', 'high', ['EURUSD', 'XAUUSD', 'NAS100']],
  9:   ['Advance Retail Sales',       'medium', ['EURUSD', 'NAS100']],
  15:  ['Industrial Production',      'medium', ['XAGUSD']],
  180: ['Unemployment Insurance Claims', 'medium', ['NAS100', 'XAUUSD']],
  82:  ['Univ. of Michigan Sentiment', 'low',   ['NAS100']],
};

export async function calendar(daysAhead = 14): Promise<CalRow[]> {
  const key = `cal:${daysAhead}`;
  const hit = getCache<CalRow[]>(key);
  if (hit) return hit;
  if (!FRED_KEY) return [];

  const today = new Date();
  const end = new Date(today.getTime() + daysAhead * 864e5);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const j = await fetchJSON<{ release_dates?: { release_id: number; release_name: string; date: string }[] }>(
    `https://api.stlouisfed.org/fred/releases/dates?api_key=${FRED_KEY}&file_type=json` +
    `&realtime_start=${fmt(today)}&realtime_end=${fmt(end)}&include_release_dates_with_no_data=true` +
    `&sort_order=asc&limit=1000`
  );
  if (!j?.release_dates) return [];

  const seen = new Set<string>();
  const out: CalRow[] = [];
  for (const r of j.release_dates) {
    const w = RELEASE_WATCH[r.release_id];
    if (!w) continue;
    const dedupe = `${r.release_id}:${r.date}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    const [title, impact, affects] = w;
    // US macro releases land 08:30 ET on their date; FOMC 14:00 ET.
    const hourUTC = r.release_id === 101 ? 18 : 12;
    out.push({
      time: new Date(`${r.date}T${String(hourUTC).padStart(2, '0')}:30:00Z`).toISOString(),
      title, currency: 'USD', impact, consensus: null, prior: null, affects,
    });
  }

  out.sort((a, b) => a.time.localeCompare(b.time));
  setCache(key, out, 3600);
  return out;
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
    { timeoutMs: 20000, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FJInstitutional/1.0)' } }
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
