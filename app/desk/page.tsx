'use client';
import { useEffect, useMemo, useState } from 'react';
import { Panel, Num } from '@/components/ui';
import { INSTRUMENTS, bySymbol } from '@/lib/types';
import { positionSize, survival, type ExitLab } from '@/lib/exitlab';

/**
 * The Risk Desk.
 *
 * Everything on this page is arithmetic or a measured, paired statistic --
 * nothing here is a forecast. It exists because our own research showed entry
 * timing carries no information while exit discipline and position sizing
 * carry a great deal, and those are the two things a trader fully controls.
 */
export default function Desk() {
  const [lab, setLab] = useState<ExitLab | null>(null);
  const [account, setAccount] = useState(10000);
  const [riskPct, setRiskPct] = useState(1);
  const [symbol, setSymbol] = useState('XAUUSD');
  const [entry, setEntry] = useState(4300);
  const [stop, setStop] = useState(4256);
  const [hit, setHit] = useState(40);
  const [rr, setRr] = useState(2.5);

  useEffect(() => {
    fetch('/api/exitlab').then(r => r.json()).then(d => { if (d.ok) setLab(d); }).catch(() => {});
  }, []);

  const size = useMemo(
    () => positionSize({ accountSize: account, riskPct, entry, stop }),
    [account, riskPct, entry, stop]);

  const surv = useMemo(
    () => survival({ hitRate: hit / 100, rr, riskPct, trades: 100, ruinPct: 50 }),
    [hit, rr, riskPct]);

  const ev = (hit / 100) * rr - (1 - hit / 100);
  const rules = lab?.instruments?.[symbol]?.rules ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[19px] font-semibold tracking-tight">Risk Desk</h1>
        <p className="mt-1 text-[12.5px]" style={{ color: 'var(--color-tertiary)' }}>
          Our research says nobody can reliably time entries — but exits and sizing are measurable
          and fully in your control. This page is arithmetic and measured statistics. No forecasts.
        </p>
      </div>

      {/* ---------- position size ---------- */}
      <Panel title="1 · How much to trade">
        <div className="grid gap-3 p-4 sm:grid-cols-4">
          {([
            ['Account ($)', account, setAccount, 100],
            ['Risk per trade (%)', riskPct, setRiskPct, 0.1],
            ['Entry', entry, setEntry, 0.01],
            ['Stop loss', stop, setStop, 0.01],
          ] as const).map(([label, val, set, step]) => (
            <label key={label} className="block">
              <span className="label-xs" style={{ color: 'var(--color-quaternary)' }}>{label}</span>
              <input
                type="number" step={step} value={val}
                onChange={e => (set as (n: number) => void)(parseFloat(e.target.value) || 0)}
                className="num mt-1 w-full rounded-md border px-2.5 py-1.5 text-[13px] outline-none"
                style={{ borderColor: 'var(--color-hairline)', background: 'var(--color-base)', color: 'var(--color-primary)' }}
              />
            </label>
          ))}
        </div>
        {size ? (
          <div className="grid gap-3 border-t px-4 py-3 sm:grid-cols-4" style={{ borderColor: 'var(--color-hairline)' }}>
            <Stat k="Risk in cash" v={`$${size.riskMoney.toLocaleString()}`} big />
            <Stat k="Position size (units)" v={size.units.toLocaleString(undefined, { maximumFractionDigits: 3 })} big accent />
            <Stat k="After 5 straight losses" v={`−$${size.drawdown5.toLocaleString()}`} />
            <Stat k="After 10 straight losses" v={`−$${size.drawdown10.toLocaleString()}`} />
          </div>
        ) : (
          <p className="px-4 pb-4 text-[12px]" style={{ color: 'var(--color-warn)' }}>
            Entry and stop must differ.
          </p>
        )}
      </Panel>

      {/* ---------- exit discipline ---------- */}
      <Panel
        title="2 · How to exit — measured, not guessed"
        action={<span className="label-xs" style={{ color: 'var(--color-quaternary)' }}>
          {lab ? `${lab.sampleSize.toLocaleString()} paired trades` : ''}
        </span>}
      >
        <div className="flex flex-wrap gap-1.5 px-4 pt-3">
          {['XAUUSD', 'XAGUSD', 'NAS100'].map(s => (
            <button key={s} onClick={() => setSymbol(s)}
              className="rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors"
              style={symbol === s
                ? { background: 'var(--color-accent)', color: '#04120F' }
                : { background: 'var(--color-raised)', color: 'var(--color-tertiary)' }}>
              {bySymbol(s)?.display ?? s}
            </button>
          ))}
        </div>
        <p className="px-4 pt-3 text-[12px] leading-relaxed" style={{ color: 'var(--color-tertiary)' }}>
          Every rule below was tested on the <b>same entries</b>, so the difference is caused by the
          exit and nothing else. That is why these t-statistics are so much larger than anything in
          our signal research.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="label-xs" style={{ color: 'var(--color-quaternary)' }}>
                <th className="px-4 py-2 text-left font-medium">Exit rule</th>
                <th className="px-4 py-2 text-right font-medium">Per trade</th>
                <th className="px-4 py-2 text-right font-medium">Hit</th>
                <th className="px-4 py-2 text-right font-medium">PF</th>
                <th className="px-4 py-2 text-right font-medium">vs breakeven</th>
                <th className="px-4 py-2 text-right font-medium">t</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r, i) => (
                <tr key={r.id} className="border-t" style={{ borderColor: 'var(--color-hairline)' }}>
                  <td className="px-4 py-2.5">
                    {i === 0 && <span className="label-xs mr-1.5 rounded px-1 py-0.5 font-semibold"
                      style={{ background: 'var(--color-long)', color: '#04120F' }}>BEST</span>}
                    {r.label}
                  </td>
                  <td className="num px-4 py-2.5 text-right"><Num value={r.expectancy} digits={3} signed colorize />R</td>
                  <td className="num px-4 py-2.5 text-right" style={{ color: 'var(--color-tertiary)' }}>{r.hitRate}%</td>
                  <td className="num px-4 py-2.5 text-right">{r.profitFactor}</td>
                  <td className="num px-4 py-2.5 text-right"><Num value={r.vsBreakeven} digits={3} signed colorize />R</td>
                  <td className="num px-4 py-2.5 text-right" style={{ color: Math.abs(r.vsBreakevenT) > 3 ? 'var(--color-long)' : 'var(--color-quaternary)' }}>
                    {r.vsBreakevenT}
                  </td>
                </tr>
              ))}
              {!rules.length && (
                <tr><td colSpan={6} className="px-4 py-6 text-center" style={{ color: 'var(--color-quaternary)' }}>
                  Loading exit research…
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-3 text-[11.5px] leading-relaxed" style={{ color: 'var(--color-quaternary)' }}>
          Note the hit rate on “breakeven at +1R”: around 20–24%, the lowest of every rule, and the
          worst expectancy on all three instruments. Moving your stop to breakeven feels safe but it
          cuts the winners that pay for your losers, while every loser still costs a full 1R.
        </p>
      </Panel>

      {/* ---------- survival ---------- */}
      <Panel title="3 · Will you survive long enough for the edge to work?">
        <div className="grid gap-3 p-4 sm:grid-cols-3">
          {([
            ['Your hit rate (%)', hit, setHit, 1],
            ['Your reward:risk', rr, setRr, 0.1],
            ['Risk per trade (%)', riskPct, setRiskPct, 0.1],
          ] as const).map(([label, val, set, step]) => (
            <label key={label} className="block">
              <span className="label-xs" style={{ color: 'var(--color-quaternary)' }}>{label}</span>
              <input type="number" step={step} value={val}
                onChange={e => (set as (n: number) => void)(parseFloat(e.target.value) || 0)}
                className="num mt-1 w-full rounded-md border px-2.5 py-1.5 text-[13px] outline-none"
                style={{ borderColor: 'var(--color-hairline)', background: 'var(--color-base)', color: 'var(--color-primary)' }} />
            </label>
          ))}
        </div>
        <div className="grid gap-3 border-t px-4 py-3 sm:grid-cols-4" style={{ borderColor: 'var(--color-hairline)' }}>
          <Stat k="Expectancy per trade" v={`${ev >= 0 ? '+' : ''}${ev.toFixed(2)}R`} big
            accent={ev > 0} danger={ev <= 0} />
          <Stat k="Chance of −50% over 100 trades" v={`${surv.ruinProbability}%`} big
            danger={surv.ruinProbability > 10} />
          <Stat k="Median equity after 100 trades" v={`${surv.medianEquity.toFixed(2)}×`} />
          <Stat k="Worst drawdown seen" v={`−${surv.worstDrawdown}%`}
            danger={surv.worstDrawdown > 40} />
        </div>
        <p className="px-4 pb-4 text-[11.5px] leading-relaxed" style={{ color: 'var(--color-tertiary)' }}>
          {ev <= 0
            ? 'Your expectancy is negative. No position size fixes this — sizing only changes how fast the account goes. Raise reward:risk or hit rate first.'
            : `Positive expectancy — but size decides whether you live to collect it. At ${riskPct}% per trade the worst drawdown in simulation was ${surv.worstDrawdown}%. Same edge at 10% risk produces a ~96% drawdown and a 1-in-5 chance of losing half the account. Most accounts die from size, not from being wrong.`}
        </p>
      </Panel>

      <p className="pb-2 text-center text-[10.5px]" style={{ color: 'var(--color-quaternary)' }}>
        Measured on {lab ? lab.sampleSize.toLocaleString() : '4,000'} paired trades over 10 years, costs deducted.
        Past behaviour is not a guarantee. You execute elsewhere.
      </p>
    </div>
  );
}

function Stat({ k, v, big, accent, danger }: {
  k: string; v: string; big?: boolean; accent?: boolean; danger?: boolean;
}) {
  return (
    <div>
      <div className="label-xs" style={{ color: 'var(--color-quaternary)' }}>{k}</div>
      <div className={big ? 'num text-[19px] font-semibold' : 'num text-[14px]'}
        style={{ color: danger ? 'var(--color-short)' : accent ? 'var(--color-accent)' : 'var(--color-primary)' }}>
        {v}
      </div>
    </div>
  );
}
