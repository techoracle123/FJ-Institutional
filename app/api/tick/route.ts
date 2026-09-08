import { NextResponse } from 'next/server';
import { INSTRUMENTS } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * Live tick endpoint.
 *
 * Polled every few seconds by the client. Deliberately separate from
 * /api/state (which carries the heavy macro + thesis payload and only needs
 * refreshing each minute) so the price pulse stays cheap and fast.
 *
 * Yahoo's chart meta is the only free source that updates intraday without a
 * key or a quota — measured lag on FX is ~20s. Twelve Data's free tier caps
 * at 8 requests/minute total, which cannot sustain a 6-symbol live pulse, so
 * it is not used here.
 */

const YF: Record<string, string> = {
  EURUSD: 'EURUSD=X', GBPUSD: 'GBPUSD=X', USDJPY: 'JPY=X',
  XAUUSD: 'GC=F', XAGUSD: 'SI=F', NAS100: 'NQ=F',
};

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

interface Meta {
  regularMarketPrice?: number;
  chartPreviousClose?: number;
  previousClose?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  regularMarketTime?: number;
  bid?: number;
  ask?: number;
}

async function one(symbol: string) {
  const yf = YF[symbol];
  if (!yf) return null;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 7000);
    const r = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${yf}?interval=1m&range=1d`,
      { signal: ctl.signal, headers: { 'User-Agent': UA }, cache: 'no-store' }
    );
    clearTimeout(t);
    if (!r.ok) return null;

    const j = (await r.json()) as {
      chart?: { result?: { meta?: Meta; timestamp?: number[]; indicators?: { quote?: { close: (number | null)[] }[] } }[] };
    };
    const res = j.chart?.result?.[0];
    const m = res?.meta;
    if (!m?.regularMarketPrice) return null;

    const price = m.regularMarketPrice;
    const prev = m.chartPreviousClose ?? m.previousClose ?? price;
    const change = price - prev;

    // Intraday 1m closes give us a live micro-sparkline and a realised
    // short-horizon volatility read the thesis layer can use.
    const closes = (res?.indicators?.quote?.[0]?.close ?? []).filter(
      (v): v is number => typeof v === 'number' && Number.isFinite(v)
    );
    const spark = closes.slice(-60);

    let vol1m: number | null = null;
    if (spark.length > 10) {
      const rets: number[] = [];
      for (let i = 1; i < spark.length; i++) rets.push((spark[i] - spark[i - 1]) / spark[i - 1]);
      const mu = rets.reduce((a, b) => a + b, 0) / rets.length;
      vol1m = Math.sqrt(rets.reduce((a, b) => a + (b - mu) ** 2, 0) / rets.length) * Math.sqrt(1440) * 100;
    }

    return {
      symbol,
      price,
      change,
      changePct: prev ? (change / prev) * 100 : 0,
      high: m.regularMarketDayHigh ?? price,
      low: m.regularMarketDayLow ?? price,
      prevClose: prev,
      marketTime: m.regularMarketTime ?? Math.floor(Date.now() / 1000),
      lagSec: m.regularMarketTime ? Math.max(0, Math.round(Date.now() / 1000 - m.regularMarketTime)) : null,
      spark,
      vol1m: vol1m == null ? null : Math.round(vol1m * 100) / 100,
    };
  } catch {
    return null;
  }
}

export async function GET() {
  const rows = await Promise.all(INSTRUMENTS.map(i => one(i.symbol)));
  const ticks: Record<string, NonNullable<Awaited<ReturnType<typeof one>>>> = {};
  for (const r of rows) if (r) ticks[r.symbol] = r;

  const lags = Object.values(ticks).map(t => t.lagSec).filter((v): v is number => v != null);

  return NextResponse.json(
    {
      ok: true,
      ticks,
      count: Object.keys(ticks).length,
      medianLagSec: lags.length ? lags.sort((a, b) => a - b)[Math.floor(lags.length / 2)] : null,
      at: new Date().toISOString(),
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
