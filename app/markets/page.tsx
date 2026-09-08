'use client';
import { useState, useMemo } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Maximize2 } from 'lucide-react';
import { useMarket } from '@/lib/useState';
import { useTicks } from '@/lib/useTicks';
import { INSTRUMENTS, bySymbol } from '@/lib/types';
import TradingViewChart from '@/components/TradingViewChart';
import { cx, LiveDot } from '@/components/ui';

const TF = [
  { l: '1m', v: '1' }, { l: '5m', v: '5' }, { l: '15m', v: '15' },
  { l: '1H', v: '60' }, { l: '4H', v: '240' }, { l: '1D', v: 'D' }, { l: '1W', v: 'W' },
];

export default function Markets() {
  const [sym, setSym] = useState('EURUSD');
  const [tf, setTf] = useState('60');
  const { data } = useMarket();
  const { ticks, lag, flash } = useTicks(5000);

  const inst = bySymbol(sym)!;
  const t = ticks[sym];
  const q = data?.quotes?.[sym];
  const price = t?.price ?? q?.price;
  const chg = t?.changePct ?? q?.changePct ?? 0;
  const thesis = data?.theses?.find(x => x.symbol === sym);

  const rows = useMemo(() => INSTRUMENTS.map(i => {
    const tk = ticks[i.symbol];
    const qq = data?.quotes?.[i.symbol];
    return {
      i,
      price: tk?.price ?? qq?.price ?? null,
      chg: tk?.change ?? qq?.change ?? null,
      chgPct: tk?.changePct ?? qq?.changePct ?? null,
      th: data?.theses?.find(x => x.symbol === i.symbol),
    };
  }), [ticks, data]);

  return (
    <div className="space-y-3">
      {/* Header strip */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[22px] font-semibold leading-none tracking-tight">{inst.display}</h1>
          {price != null && (
            <>
              <span className={cx('num text-[22px] font-semibold leading-none tracking-tight transition-colors duration-500')}
                style={{ color: flash[sym] === 'up' ? 'var(--color-long)' : flash[sym] === 'down' ? 'var(--color-short)' : 'var(--color-primary)' }}>
                {price.toLocaleString(undefined, { minimumFractionDigits: inst.digits, maximumFractionDigits: inst.digits })}
              </span>
              <span className="num text-[13px] font-medium"
                style={{ color: chg >= 0 ? 'var(--color-long)' : 'var(--color-short)' }}>
                {chg >= 0 ? '+' : ''}{chg.toFixed(2)}%
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <LiveDot />
            <span className="label-xs" style={{ color: 'var(--color-tertiary)' }}>
              LIVE{lag != null && lag < 120 ? ` · ${lag}s` : ''}
            </span>
          </span>
          <Link href={`/markets/${sym}`}
            className="flex items-center gap-1 text-[11.5px] font-medium transition-colors hover:text-[var(--color-accent)]"
            style={{ color: 'var(--color-tertiary)' }}>
            Full analysis <ArrowUpRight size={12} />
          </Link>
        </div>
      </div>

      {/* Chart + watchlist */}
      <div className="grid gap-3 lg:grid-cols-[1fr_264px]">
        <div className="panel overflow-hidden">
          {/* Timeframes */}
          <div className="flex items-center gap-px border-b px-2 py-1.5" style={{ borderColor: 'var(--color-hairline)' }}>
            {TF.map(x => (
              <button key={x.v} onClick={() => setTf(x.v)}
                className={cx('rounded-[2px] px-2.5 py-1 text-[11px] font-medium transition-colors',
                  tf === x.v ? 'text-[var(--color-primary)]' : 'text-[var(--color-quaternary)] hover:text-[var(--color-secondary)]')}
                style={tf === x.v ? { background: 'var(--color-overlay)' } : undefined}>
                {x.l}
              </button>
            ))}
            <span className="ml-auto pr-1 label-xs" style={{ color: 'var(--color-quaternary)' }}>
              DRAWINGS SAVED
            </span>
          </div>
          <TradingViewChart symbol={inst.tvSymbol} interval={tf} height={548} />
        </div>

        {/* Watchlist */}
        <div className="panel flex flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b px-3 py-2" style={{ borderColor: 'var(--color-hairline)' }}>
            <span className="label">Watchlist</span>
            <span className="label-xs" style={{ color: 'var(--color-quaternary)' }}>{rows.length}</span>
          </div>

          <div className="grid grid-cols-[1fr_auto_auto] gap-x-2 px-3 py-1.5 label-xs"
            style={{ color: 'var(--color-quaternary)', borderBottom: '1px solid var(--color-hairline)' }}>
            <span>SYMBOL</span><span className="text-right">LAST</span><span className="w-[52px] text-right">CHG%</span>
          </div>

          <div className="flex-1 overflow-y-auto">
            {rows.map(({ i, price: p, chgPct, th }) => {
              const on = i.symbol === sym;
              const f = flash[i.symbol];
              return (
                <button key={i.symbol} onClick={() => setSym(i.symbol)}
                  className={cx('grid w-full grid-cols-[1fr_auto_auto] items-center gap-x-2 px-3 py-2 text-left transition-colors',
                    on ? 'bg-[var(--color-raised)]' : 'hover:bg-[var(--color-surface)]')}
                  style={on ? { boxShadow: 'inset 2px 0 0 var(--color-accent)' } : undefined}>
                  <span className="min-w-0">
                    <span className="block truncate text-[12px] font-medium">{i.display}</span>
                    {th && (
                      <span className="label-xs" style={{ color: th.direction === 'long' ? 'var(--color-long)' : 'var(--color-short)' }}>
                        {th.direction} {th.conviction}
                      </span>
                    )}
                  </span>
                  <span className="num text-right text-[12px] transition-colors duration-500"
                    style={{ color: f === 'up' ? 'var(--color-long)' : f === 'down' ? 'var(--color-short)' : 'var(--color-secondary)' }}>
                    {p != null ? p.toLocaleString(undefined, { minimumFractionDigits: i.digits, maximumFractionDigits: i.digits }) : '—'}
                  </span>
                  <span className="num w-[52px] text-right text-[11.5px]"
                    style={{ color: chgPct == null ? 'var(--color-quaternary)' : chgPct >= 0 ? 'var(--color-long)' : 'var(--color-short)' }}>
                    {chgPct != null ? `${chgPct >= 0 ? '+' : ''}${chgPct.toFixed(2)}%` : '—'}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Thesis snippet for selected */}
          {thesis && (
            <div className="border-t px-3 py-2.5" style={{ borderColor: 'var(--color-hairline)' }}>
              <div className="label mb-1">Active thesis</div>
              <p className="text-[11.5px] leading-snug" style={{ color: 'var(--color-secondary)' }}>
                {thesis.headline}
              </p>
              <div className="mt-1.5 flex items-center gap-2.5 text-[11px]">
                <span className="num" style={{ color: 'var(--color-accent)' }}>{thesis.probability}%</span>
                <span className="num" style={{ color: 'var(--color-tertiary)' }}>{thesis.rr}:1</span>
                <span className="num" style={{ color: 'var(--color-tertiary)' }}>{thesis.expectedValue}R</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
