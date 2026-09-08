'use client';
import { useState } from 'react';
import { Minus } from 'lucide-react';
import { useMarket } from '@/lib/useState';
import ThesisCard from '@/components/ThesisCard';
import { Panel, Empty, cx } from '@/components/ui';
import { bySymbol } from '@/lib/types';

const FILTERS = ['all', 'long', 'short'] as const;

export default function Opportunities() {
  const { data, loading } = useMarket();
  const [f, setF] = useState<(typeof FILTERS)[number]>('all');

  if (loading) return <div className="space-y-3"><div className="skeleton h-16 w-full" /><div className="skeleton h-64 w-full" /></div>;

  const all = data?.theses ?? [];
  const shown = f === 'all' ? all : all.filter(t => t.direction === f);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold leading-none tracking-tight">Opportunities</h1>
          <p className="mt-1.5 text-[12.5px]" style={{ color: 'var(--color-tertiary)' }}>
            Ranked by conviction. Every thesis is falsifiable and carries its own invalidation.
          </p>
        </div>
        <div className="flex gap-px">
          {FILTERS.map(x => (
            <button key={x} onClick={() => setF(x)}
              className={cx('px-3 py-1.5 text-[11.5px] font-medium capitalize transition-colors',
                f === x ? 'bg-[var(--color-raised)] text-[var(--color-primary)]' : 'text-[var(--color-quaternary)] hover:text-[var(--color-secondary)]')}
              style={{ border: '1px solid var(--color-hairline)' }}>
              {x}
            </button>
          ))}
        </div>
      </div>

      {shown.length ? (
        <div className="space-y-3">{shown.map((t, i) => <ThesisCard key={t.id} t={t} rank={i + 1} />)}</div>
      ) : (
        <Panel><Empty icon={<Minus size={26} />} title="Nothing meets the bar"
          body="No instrument currently clears the evidence, liquidity and data-confidence gates. Silence is a valid output." /></Panel>
      )}

      {!!data?.noEdge?.length && (
        <Panel title="Screened out" dense>
          <div className="divide-y" style={{ borderColor: 'var(--color-hairline)' }}>
            {data.noEdge.map(n => (
              <div key={n.symbol} className="flex items-baseline gap-3 px-4 py-2.5">
                <span className="w-[80px] shrink-0 text-[12px] font-medium" style={{ color: 'var(--color-tertiary)' }}>
                  {bySymbol(n.symbol)?.display ?? n.symbol}
                </span>
                <span className="text-[11.5px]" style={{ color: 'var(--color-quaternary)' }}>{n.reason}</span>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
