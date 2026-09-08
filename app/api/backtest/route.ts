import { NextResponse } from 'next/server';
import { history } from '@/lib/datarouter';
import { backtest, fitRecalibration, applyRecalibration } from '@/lib/backtest';
import { INSTRUMENTS } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const only = url.searchParams.get('symbol');
  const targets = only ? INSTRUMENTS.filter(i => i.symbol === only) : INSTRUMENTS;

  try {
    const results = await Promise.all(
      targets.map(async i => {
        const bars = await history(i.symbol, '5y');
        if (bars.length < 120) return null;
        const last = bars[bars.length - 1];
        const r = backtest(i.symbol, bars, {
          costR: Math.max(0.02, i.spreadEst / (last.close * 0.01) || 0.03),
        });
        return { ...r, barCount: bars.length, from: bars[0].time, to: last.time };
      })
    );

    const ok = results.filter(Boolean) as NonNullable<(typeof results)[number]>[];
    const all = ok.flatMap(r => r.trades);
    const wins = all.filter(t => t.win).length;

    // Fit the correction from realised outcomes, then report the Brier score
    // both before and after, so the improvement is auditable.
    const curve = fitRecalibration(all);
    const brierRaw = all.length
      ? all.reduce((a, t) => a + (t.probability - (t.win ? 1 : 0)) ** 2, 0) / all.length : null;
    const brierCal = all.length
      ? all.reduce((a, t) => a + (applyRecalibration(t.probability, curve) - (t.win ? 1 : 0)) ** 2, 0) / all.length : null;

    return NextResponse.json({
      ok: true,
      results: ok.map(({ trades, ...rest }) => ({ ...rest, recent: trades.slice(-12).reverse() })),
      recalibration: curve,
      perInstrument: Object.fromEntries(
        ok.map(r => [r.symbol, fitRecalibration(r.trades)]).filter(([, c]) => (c as unknown[]).length > 0)
      ),
      aggregate: {
        n: all.length,
        hitRate: all.length ? Math.round((wins / all.length) * 1000) / 10 : 0,
        totalR: Math.round(all.reduce((a, b) => a + b.r, 0) * 100) / 100,
        brierRaw: brierRaw == null ? null : Math.round(brierRaw * 1000) / 1000,
        brierCalibrated: brierCal == null ? null : Math.round(brierCal * 1000) / 1000,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
