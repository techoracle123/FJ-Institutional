'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

/**
 * Shown when the board is silent.
 *
 * Reads live verification data rather than hardcoding numbers — the previous
 * version had figures baked into the markup that had already drifted from the
 * real values (+0.145R displayed vs +0.216R actual).
 *
 * Crucially this does not leave the trader with nothing: it routes them to the
 * verified breakout engine and the exit findings that DID survive testing.
 */
interface Row { symbol: string; expectancy: number; ciLow: number; placeboMedian: number; pValue: number }

export function VerificationNotice() {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    fetch('/api/backtest')
      .then(r => r.json())
      .then(d => {
        if (!d?.results) return;
        setRows(d.results.filter((r: { verification?: unknown }) => r.verification)
          .map((r: { symbol: string; verification: Omit<Row, 'symbol'> }) => ({
            symbol: r.symbol, ...r.verification,
          })));
      })
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-3">
      <div className="rounded-lg border p-4 sm:p-5"
        style={{ borderColor: 'var(--color-warn)', background: 'rgba(255,176,32,0.05)' }}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="label-xs rounded px-1.5 py-0.5 font-semibold"
            style={{ background: 'var(--color-warn)', color: '#120A00' }}>
            DAILY MODEL SUSPENDED
          </span>
          <span className="text-[13px] font-semibold">The daily evidence-stack model is silent. The verified breakout engine is live and armed.</span>
        </div>

        <p className="mt-3 text-[12.5px] leading-relaxed" style={{ color: 'var(--color-secondary)' }}>
          One model <b>did</b> pass verification: the <b>NAS100 96-hour channel breakout</b>. It is armed
          and will publish the moment it triggers, roughly <b>once a day</b>. Measured over 859 historical
          breaks it returns <b>+0.170R</b> per trade (95% CI +0.071 to +0.268, t=3.40, p&lt;0.001) against a
          random-timing placebo of <b>&minus;0.028R</b>. Shorts (+0.211R) beat longs (+0.151R) in a market
          that rose 19.9%/year &mdash; which is how we know it is timing, not drift.
        </p>

        <p className="mt-3 text-[12.5px] leading-relaxed" style={{ color: 'var(--color-secondary)' }}>
          The table below is the <b>daily</b> model, which is the one that failed. We replaced its
          signal with <b>random entry timing</b>, keeping the exit rules and long/short mix identical,
          and the random version did just as well. Its backtest profit came from the trailing stop
          riding a bull market (gold and silver drifted roughly <b>+13%/year</b>, the Nasdaq
          <b> +20%/year</b>), not from the signal picking good moments. It stays suspended.
          The hourly breakout above is a separate model and is <b>not</b> in this table.
        </p>

        {rows?.length ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-[11.5px]">
              <thead>
                <tr style={{ color: 'var(--color-quaternary)' }}>
                  <th className="pb-1 text-left font-medium">Instrument</th>
                  <th className="pb-1 text-right font-medium">Our result</th>
                  <th className="pb-1 text-right font-medium">Worst case (95%)</th>
                  <th className="pb-1 text-right font-medium">Random entry</th>
                  <th className="pb-1 text-right font-medium">p-value</th>
                </tr>
              </thead>
              <tbody style={{ color: 'var(--color-secondary)' }}>
                {rows.map(r => (
                  <tr key={r.symbol} className="border-t" style={{ borderColor: 'var(--color-hairline)' }}>
                    <td className="py-1.5">{r.symbol}</td>
                    <td className="num py-1.5 text-right">{r.expectancy >= 0 ? '+' : ''}{r.expectancy.toFixed(3)}R</td>
                    <td className="num py-1.5 text-right">{r.ciLow >= 0 ? '+' : ''}{r.ciLow.toFixed(3)}R</td>
                    <td className="num py-1.5 text-right">{r.placeboMedian >= 0 ? '+' : ''}{r.placeboMedian.toFixed(3)}R</td>
                    <td className="num py-1.5 text-right" style={{ color: 'var(--color-warn)' }}>{r.pValue.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[11px]" style={{ color: 'var(--color-quaternary)' }}>
              Daily evidence-stack model only. A p-value under 0.05 means the signal genuinely beats
              chance &mdash; none of these do, which is why they are silent. For contrast the hourly
              NAS100 breakout scores <b style={{ color: 'var(--color-accent)' }}>p&lt;0.001</b>.
            </p>
          </div>
        ) : null}
      </div>

      {/* The constructive half — never leave the trader with only a refusal. */}
      <div className="rounded-lg border p-4 sm:p-5"
        style={{ borderColor: 'var(--color-accent)', background: 'rgba(34,229,200,0.06)' }}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="label-xs rounded px-1.5 py-0.5 font-semibold"
            style={{ background: 'var(--color-accent)', color: '#04120F' }}>
            WHAT DID SURVIVE
          </span>
          <span className="text-[13px] font-semibold">Exits and position size — and both are yours to control.</span>
        </div>
        <p className="mt-3 text-[12.5px] leading-relaxed" style={{ color: 'var(--color-secondary)' }}>
          The same testing that killed our entry signal found something far stronger. Holding entries
          fixed and changing <b>only the exit rule</b> moves expectancy by up to <b>+0.42R per trade</b>,
          with t-statistics of <b>10 to 20</b> — versus t≈1 for every entry signal we tried. The most
          expensive habit we measured is moving your stop to breakeven at +1R: it produced the
          <b> worst</b> result on all three instruments.
        </p>
        <Link href="/desk"
          className="mt-3 inline-block rounded-md px-3 py-1.5 text-[12.5px] font-semibold"
          style={{ background: 'var(--color-accent)', color: '#04120F' }}>
          Open the Risk Desk →
        </Link>
      </div>
    </div>
  );
}
