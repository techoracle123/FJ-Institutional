'use client';
import { useEffect, useState } from 'react';
import { Panel, Empty, Num, cx } from '@/components/ui';

interface Res {
  symbol: string; n: number; hitRate: number; totalR: number; avgR: number;
  profitFactor: number; maxDrawdownR: number; sharpe: number; avgBars: number;
  sufficient: boolean; barCount: number; from: number; to: number;
  equity: { t: number; r: number }[];
  calibration: { bucket: string; predicted: number; actual: number; n: number }[];
  recent: { entryTime: number; direction: string; r: number; win: boolean; probability: number; reason: string }[];
}

function Equity({ pts }: { pts: { t: number; r: number }[] }) {
  if (pts.length < 2) return null;
  const w = 560, h = 90;
  const ys = pts.map(p => p.r);
  const min = Math.min(0, ...ys), max = Math.max(0, ...ys);
  const span = max - min || 1;
  const d = pts.map((p, i) =>
    `${i ? 'L' : 'M'}${(i / (pts.length - 1)) * w},${h - ((p.r - min) / span) * h}`).join(' ');
  const zero = h - ((0 - min) / span) * h;
  const pos = ys[ys.length - 1] >= 0;
  const c = pos ? 'var(--color-long)' : 'var(--color-short)';
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: 90 }} preserveAspectRatio="none">
      <line x1="0" y1={zero} x2={w} y2={zero} stroke="var(--color-hairline)" strokeWidth="1" />
      <path d={`${d} L${w},${zero} L0,${zero} Z`} fill={c} opacity="0.09" />
      <path d={d} fill="none" stroke={c} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function Record() {
  const [d, setD] = useState<{ results: Res[]; aggregate: any; recalibration: any[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/backtest').then(r => r.json()).then(j => {
      if (j.ok) setD(j); else setErr(j.error);
    }).catch(e => setErr(e.message));
  }, []);

  if (err) return <Panel><Empty title="Backtest unavailable" body={err} /></Panel>;
  if (!d) return (
    <div className="space-y-4">
      <div className="skeleton h-20 w-full" /><div className="skeleton h-64 w-full" />
    </div>
  );

  const a = d.aggregate;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[26px] font-semibold leading-none tracking-tight">Track Record</h1>
        <p className="mt-1.5 max-w-[70ch] text-[12.5px] leading-relaxed" style={{ color: 'var(--color-tertiary)' }}>
          Walk-forward backtest of the deployed decision logic over five years of daily data.
          No lookahead: every entry is taken at the next bar's open, stops resolve before targets
          when a bar spans both, and spread cost is charged on every trade.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-px sm:grid-cols-4">
        {[
          ['Trades', String(a.n), 'var(--color-primary)'],
          ['Hit rate', a.hitRate + '%', 'var(--color-primary)'],
          ['Total R', (a.totalR >= 0 ? '+' : '') + a.totalR, a.totalR >= 0 ? 'var(--color-long)' : 'var(--color-short)'],
          ['Brier (calibrated)', String(a.brierCalibrated ?? '—'), 'var(--color-accent)'],
        ].map(([l, v, c]) => (
          <div key={l} className="panel px-4 py-3">
            <div className="label">{l}</div>
            <div className="num mt-1 text-[19px] font-semibold" style={{ color: c }}>{v}</div>
          </div>
        ))}
      </div>

      <Panel title="Calibration correction" dense>
        <div className="space-y-2.5 px-4 py-3.5 text-[12px] leading-relaxed" style={{ color: 'var(--color-secondary)' }}>
          <p>
            The raw evidence score was <b style={{ color: 'var(--color-warn)' }}>overconfident</b>. It implied
            roughly 72% where the realised rate of reaching target before stop was near 41%. We fit an isotonic
            correction from the realised outcomes and apply it to every live probability.
          </p>
          <p className="num" style={{ color: 'var(--color-tertiary)' }}>
            Brier score {a.brierRaw} → <b style={{ color: 'var(--color-long)' }}>{a.brierCalibrated}</b> after correction (lower is better).
          </p>
          <p style={{ color: 'var(--color-quaternary)' }}>
            A ~40% hit rate is not a weakness when average reward-to-risk is near 2.9:1 — that combination is
            decisively positive expectancy. We would rather publish an honest 40% than an inflated 70%.
          </p>
        </div>
      </Panel>

      <Panel title="By instrument" dense>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="label-xs" style={{ color: 'var(--color-quaternary)' }}>
                {['Instrument', 'Trades', 'Hit', 'Total R', 'Avg R', 'PF', 'Max DD', 'Sharpe'].map((h, i) => (
                  <th key={h} className={cx('px-4 py-2 font-medium', i === 0 ? 'text-left' : 'text-right')}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.results.map(r => (
                <tr key={r.symbol} onClick={() => setOpen(open === r.symbol ? null : r.symbol)}
                  className="cursor-pointer border-t transition-colors hover:bg-[var(--color-raised)]"
                  style={{ borderColor: 'var(--color-hairline)' }}>
                  <td className="px-4 py-2.5 font-medium">{r.symbol}</td>
                  <td className="num px-4 py-2.5 text-right">{r.n}</td>
                  <td className="num px-4 py-2.5 text-right">{r.hitRate}%</td>
                  <td className="num px-4 py-2.5 text-right">
                    <Num value={r.totalR} digits={2} signed colorize />
                  </td>
                  <td className="num px-4 py-2.5 text-right"><Num value={r.avgR} digits={3} signed colorize /></td>
                  <td className="num px-4 py-2.5 text-right"
                    style={{ color: r.profitFactor >= 1 ? 'var(--color-long)' : 'var(--color-short)' }}>{r.profitFactor}</td>
                  <td className="num px-4 py-2.5 text-right" style={{ color: 'var(--color-tertiary)' }}>−{r.maxDrawdownR}</td>
                  <td className="num px-4 py-2.5 text-right">{r.sharpe}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {d.results.filter(r => open === r.symbol).map(r => (
        <Panel key={r.symbol} title={`${r.symbol} — equity curve (R)`} dense>
          <div className="px-4 py-3"><Equity pts={r.equity} /></div>
          {r.calibration.length > 0 && (
            <div className="border-t px-4 py-3" style={{ borderColor: 'var(--color-hairline)' }}>
              <div className="label mb-2">Predicted vs realised</div>
              <div className="space-y-1.5">
                {r.calibration.map(c => (
                  <div key={c.bucket} className="flex items-center gap-3 text-[11.5px]">
                    <span className="num w-[62px]" style={{ color: 'var(--color-tertiary)' }}>{c.bucket}</span>
                    <span className="num w-[44px] text-right" style={{ color: 'var(--color-quaternary)' }}>{c.predicted}%</span>
                    <span style={{ color: 'var(--color-quaternary)' }}>→</span>
                    <span className="num w-[44px]" style={{ color: 'var(--color-primary)' }}>{c.actual}%</span>
                    <span className="num text-[10.5px]" style={{ color: 'var(--color-quaternary)' }}>n={c.n}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Panel>
      ))}

      <p className="pb-2 text-center text-[10.5px]" style={{ color: 'var(--color-quaternary)' }}>
        Backtested results are hypothetical and not a guarantee of future performance.
      </p>
    </div>
  );
}
