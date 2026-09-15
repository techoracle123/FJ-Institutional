/**
 * Verification notice.
 *
 * When the entry model is suspended the board is empty, and an empty board
 * with no explanation looks like a broken product. This states plainly what
 * was measured, what failed, and what happens next.
 */
export function VerificationNotice() {
  const rows = [
    { sym: 'XAU/USD', exp: '+0.145R', ci: '+0.061R', plac: '+0.118R', p: '0.278' },
    { sym: 'XAG/USD', exp: '+0.194R', ci: '+0.105R', plac: '+0.190R', p: '0.473' },
    { sym: 'NAS100', exp: '+0.038R', ci: '−0.030R', plac: '+0.020R', p: '0.335' },
  ];
  return (
    <div
      className="rounded-lg border p-4 sm:p-5"
      style={{ borderColor: 'var(--color-warn)', background: 'rgba(255,176,32,0.05)' }}
    >
      <div className="flex items-center gap-2">
        <span
          className="label-xs rounded px-1.5 py-0.5 font-semibold"
          style={{ background: 'var(--color-warn)', color: '#120A00' }}
        >
          SIGNALS SUSPENDED
        </span>
        <span className="text-[13px] font-semibold">The entry model failed its own verification test.</span>
      </div>

      <p className="mt-3 text-[12.5px] leading-relaxed" style={{ color: 'var(--color-secondary)' }}>
        We replaced our signal with <b>random entry timing</b>, keeping the exit rules and the
        long/short mix identical. The random version performed just as well. That means the
        profit in our backtest came from the trailing stop riding a strong bull market — gold
        and silver drifted roughly <b>+13%/year</b> and the Nasdaq <b>+20%/year</b> over the test
        period — and not from our signal choosing good moments.
      </p>

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
              <tr key={r.sym} className="border-t" style={{ borderColor: 'var(--color-hairline)' }}>
                <td className="py-1.5">{r.sym}</td>
                <td className="py-1.5 text-right tabular-nums">{r.exp}</td>
                <td className="py-1.5 text-right tabular-nums">{r.ci}</td>
                <td className="py-1.5 text-right tabular-nums">{r.plac}</td>
                <td className="py-1.5 text-right tabular-nums" style={{ color: 'var(--color-warn)' }}>{r.p}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[11.5px] leading-relaxed" style={{ color: 'var(--color-tertiary)' }}>
        A p-value below 0.05 would mean the signal genuinely beats chance. Ours are 0.28–0.47.
        We also built and tested a macro-driven replacement (2-year yields, the 2s10s curve,
        10-year real yields, VIX) — it improved expectancy but failed the same test.
        Rather than keep publishing calls we cannot defend, the board stays closed until an
        entry model passes. Prices, regimes, positioning and the calendar remain live.
      </p>
    </div>
  );
}
