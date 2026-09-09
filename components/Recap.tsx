'use client';

import React from 'react';
import { Panel } from './ui';

/**
 * Period recap. Deliberately shows losing calls as prominently as winners:
 * a ~40% hit rate is BY DESIGN (the edge comes from ~2.9:1 payoff), so a
 * recap that highlighted only wins would train users to distrust a perfectly
 * healthy system the first time they saw a loss.
 */
export function Recap({ today, week }: { today: any; week: any }) {
  const [tab, setTab] = React.useState<'today' | 'week'>('today');
  const d = tab === 'today' ? today : week;
  if (!d) return null;

  return (
    <Panel
      title="Recap"
      action={
        <div className="flex gap-1">
          {(['today', 'week'] as const).map(k => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className="label-xs rounded px-2 py-1 transition-colors"
              style={{
                background: tab === k ? 'rgba(34,229,200,0.1)' : 'transparent',
                color: tab === k ? 'var(--color-accent)' : 'var(--color-quaternary)',
              }}
            >
              {k === 'today' ? 'Today' : 'This week'}
            </button>
          ))}
        </div>
      }
      dense
    >
      <div className="grid grid-cols-4 gap-px border-b"
        style={{ background: 'var(--color-hairline)', borderColor: 'var(--color-hairline)' }}>
        <Cell label="Published" value={d.published} />
        <Cell label="Decided" value={d.decided} />
        <Cell
          label="Hit rate"
          value={d.hitRate == null ? '—' : `${d.hitRate}%`}
          hint={d.decided < 10 ? 'small sample' : undefined}
        />
        <Cell
          label="Net"
          value={`${d.totalR > 0 ? '+' : ''}${d.totalR}R`}
          color={d.totalR > 0 ? 'var(--color-long)' : d.totalR < 0 ? 'var(--color-short)' : undefined}
        />
      </div>

      {d.rows.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <div className="text-[12.5px]" style={{ color: 'var(--color-tertiary)' }}>
            Nothing published in this period.
          </div>
          <div className="mt-1 text-[11.5px]" style={{ color: 'var(--color-quaternary)' }}>
            Silence is a valid output — when evidence is thin or conflicting, we say nothing.
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b" style={{ borderColor: 'var(--color-hairline)' }}>
                {['Pair', 'Published', 'Open', 'Won', 'Lost', 'Hit', 'Net R', 'Peak', 'Worst'].map(h => (
                  <th key={h} className="label-xs px-3 py-2 font-normal"
                    style={{ color: 'var(--color-quaternary)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.rows.map((r: any) => (
                <tr key={r.symbol} className="border-b last:border-0"
                  style={{ borderColor: 'var(--color-hairline)' }}>
                  <td className="num px-3 py-2 text-[12px]" style={{ color: 'var(--color-primary)' }}>{r.symbol}</td>
                  <td className="num px-3 py-2 text-[12px]" style={{ color: 'var(--color-secondary)' }}>{r.published}</td>
                  <td className="num px-3 py-2 text-[12px]" style={{ color: 'var(--color-tertiary)' }}>{r.open}</td>
                  <td className="num px-3 py-2 text-[12px]" style={{ color: 'var(--color-long)' }}>{r.won}</td>
                  <td className="num px-3 py-2 text-[12px]" style={{ color: 'var(--color-short)' }}>{r.lost}</td>
                  <td className="num px-3 py-2 text-[12px]" style={{ color: 'var(--color-secondary)' }}>
                    {r.hitRate == null ? '—' : `${r.hitRate}%`}
                  </td>
                  <td className="num px-3 py-2 text-[12px]"
                    style={{ color: r.totalR >= 0 ? 'var(--color-long)' : 'var(--color-short)' }}>
                    {r.totalR > 0 ? '+' : ''}{r.totalR}
                  </td>
                  <td className="num px-3 py-2 text-[12px]" style={{ color: 'var(--color-quaternary)' }}>{r.maxMfeR}R</td>
                  <td className="num px-3 py-2 text-[12px]" style={{ color: 'var(--color-quaternary)' }}>{r.maxMaeR}R</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

/**
 * Live calibration. Per the user's explicit direction this REPORTS
 * divergence and never auto-suspends — different regimes legitimately
 * produce different hit rates.
 */
export function Calibration({ calibration, regimes }: { calibration: any; regimes: any[] }) {
  if (!calibration) return null;
  const c = calibration;

  return (
    <Panel title="Are our probabilities honest?" dense>
      <div className="px-4 py-3">
        <p className="text-[12.5px] leading-relaxed" style={{ color: 'var(--color-tertiary)' }}>
          Every published thesis is recorded and scored automatically. This compares what we
          claimed against what actually happened.{' '}
          {!c.sufficient && (
            <span style={{ color: 'var(--color-warn)' }}>
              Only {c.total} settled {c.total === 1 ? 'thesis' : 'theses'} so far — not yet a
              meaningful sample. Treat these numbers as provisional until 30+.
            </span>
          )}
        </p>

        <div className="mt-3 grid grid-cols-3 gap-px"
          style={{ background: 'var(--color-hairline)' }}>
          <Cell label="We claimed" value={c.claimedOverall == null ? '—' : `${c.claimedOverall}%`} />
          <Cell label="Reality" value={c.realisedOverall == null ? '—' : `${c.realisedOverall}%`} />
          <Cell label="Backtest baseline" value={`${c.backtestBaseline}%`} />
        </div>
      </div>

      {c.rows.length > 0 && (
        <div className="border-t px-4 py-3" style={{ borderColor: 'var(--color-hairline)' }}>
          <div className="label-xs mb-2" style={{ color: 'var(--color-quaternary)' }}>
            By confidence band
          </div>
          {c.rows.map((r: any) => (
            <div key={r.band} className="flex items-center gap-3 py-1">
              <span className="num w-16 text-[11.5px]" style={{ color: 'var(--color-tertiary)' }}>{r.band}</span>
              <div className="relative h-[5px] flex-1 rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }}>
                <div className="absolute h-full rounded-full"
                  style={{ width: `${r.realised}%`, background: 'var(--color-accent)' }} />
                <div className="absolute top-[-2px] h-[9px] w-px"
                  style={{ left: `${r.claimed}%`, background: 'var(--color-warn)' }} />
              </div>
              <span className="num w-24 text-right text-[11.5px]" style={{ color: 'var(--color-secondary)' }}>
                {r.realised}% of {r.n}
              </span>
            </div>
          ))}
          <div className="label-xs mt-2" style={{ color: 'var(--color-quaternary)' }}>
            Bar = realised · tick = claimed
          </div>
        </div>
      )}

      {regimes?.length > 0 && (
        <div className="border-t px-4 py-3" style={{ borderColor: 'var(--color-hairline)' }}>
          <div className="label-xs mb-2" style={{ color: 'var(--color-quaternary)' }}>
            By market regime — where the edge actually lives
          </div>
          {regimes.map(r => (
            <div key={r.regime} className="flex items-center justify-between py-1">
              <span className="text-[12px]" style={{ color: 'var(--color-secondary)' }}>
                {String(r.regime).replace('_', ' · ')}
              </span>
              <span className="num text-[11.5px]" style={{ color: 'var(--color-tertiary)' }}>
                n={r.n} · {r.hitRate}% ·{' '}
                <span style={{ color: r.expectancy >= 0 ? 'var(--color-long)' : 'var(--color-short)' }}>
                  {r.expectancy > 0 ? '+' : ''}{r.expectancy}R avg
                </span>
                {!r.sufficient && <span style={{ color: 'var(--color-quaternary)' }}> · thin</span>}
              </span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function Cell({ label, value, color, hint }: {
  label: string; value: React.ReactNode; color?: string; hint?: string;
}) {
  return (
    <div className="px-3 py-2.5" style={{ background: 'var(--color-surface)' }}>
      <div className="label-xs" style={{ color: 'var(--color-quaternary)' }}>{label}</div>
      <div className="num mt-0.5 text-[16px]" style={{ color: color ?? 'var(--color-primary)' }}>{value}</div>
      {hint && <div className="label-xs mt-0.5" style={{ color: 'var(--color-warn)' }}>{hint}</div>}
    </div>
  );
}
