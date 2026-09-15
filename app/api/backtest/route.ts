import { NextResponse } from 'next/server';
import { history, alignedFredChange, FRED_IDS } from '@/lib/datarouter';
import { backtest, fitRecalibration, applyRecalibration } from '@/lib/backtest';
import { INSTRUMENTS, SIGNAL_INSTRUMENTS } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const only = url.searchParams.get('symbol');
  // Default to signal-eligible instruments only: reporting aggregate stats
  // over instruments we refuse to trade would misstate the live edge.
  // ?symbol= still allows inspecting any instrument, and ?all=1 shows the
  // full set including the suppressed FX majors.
  const all = url.searchParams.get('all') === '1';
  const targets = only
    ? INSTRUMENTS.filter(i => i.symbol === only)
    : all ? INSTRUMENTS : SIGNAL_INSTRUMENTS;

  try {
    const results = await Promise.all(
      targets.map(async i => {
        // 10y, not 5y. The verified real-yield cell has a true effect of
        // ~+0.08R/trade; at 5y (n~320) the bootstrap floor straddles zero and
        // a real edge reads as unverified. 10y (n~630) resolves it.
        const bars = await history(i.symbol, '10y');
        if (bars.length < 120) return null;
        // Point-in-time macro, aligned to the bars.
        const real10yD20 = await alignedFredChange(
          bars.map(b => b.time), FRED_IDS.REAL10Y, 20);
        const last = bars[bars.length - 1];
        const r = backtest(i.symbol, bars, {
          macro: { real10yD20 },
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
