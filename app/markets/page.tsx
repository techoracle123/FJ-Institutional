'use client';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { useMarket } from '@/lib/useState';
import { INSTRUMENTS } from '@/lib/types';
import { Panel, Num, ObsDot } from '@/components/ui';

export default function Markets() {
  const { data, loading } = useMarket();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[26px] font-semibold leading-none tracking-tight">Markets</h1>
        <p className="mt-1.5 text-[12.5px]" style={{ color: 'var(--color-tertiary)' }}>
          Six instruments, covered in depth. Depth beats breadth.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {INSTRUMENTS.map(i => {
          const q = data?.quotes?.[i.symbol];
          const th = data?.theses?.find(t => t.symbol === i.symbol);
          return (
            <Link key={i.symbol} href={`/markets/${i.symbol}`}
              className="panel group px-4 py-3.5 transition-colors hover:bg-[var(--color-raised)]">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[14px] font-semibold tracking-tight">{i.display}</div>
                  <div className="mt-0.5 text-[11px]" style={{ color: 'var(--color-quaternary)' }}>{i.name}</div>
                </div>
                <ArrowUpRight size={13} className="opacity-0 transition-opacity group-hover:opacity-60" />
              </div>

              {loading ? <div className="skeleton mt-3 h-6 w-24" /> : q ? (
                <div className="mt-3 flex items-baseline gap-2.5">
                  <span className="num text-[20px] font-semibold tracking-tight">
                    {q.price.toLocaleString(undefined, { minimumFractionDigits: i.digits, maximumFractionDigits: i.digits })}
                  </span>
                  <Num value={q.changePct} digits={2} signed suffix="%" colorize className="text-[12px]" />
                </div>
              ) : <div className="mt-3 text-[12px]" style={{ color: 'var(--color-quaternary)' }}>—</div>}

              <div className="mt-3 flex items-center justify-between border-t pt-2.5" style={{ borderColor: 'var(--color-hairline)' }}>
                <span className="label-xs" style={{ color: 'var(--color-quaternary)' }}>
                  {th ? `${th.direction} · ${th.conviction}` : 'No active thesis'}
                </span>
                {th && (
                  <span className="num text-[11px] font-medium" style={{ color: 'var(--color-accent)' }}>
                    {th.probability}%
                  </span>
                )}
              </div>

              <div className="mt-2 flex flex-wrap gap-1">
                {i.drivers.slice(0, 3).map(d => (
                  <span key={d} className="rounded-[2px] px-1.5 py-0.5 text-[10px]"
                    style={{ background: 'var(--color-overlay)', color: 'var(--color-tertiary)' }}>{d}</span>
                ))}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
