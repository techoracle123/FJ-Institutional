'use client';
import { use } from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { useMarket } from '@/lib/useState';
import { bySymbol } from '@/lib/types';
import TradingViewChart from '@/components/TradingViewChart';
import ThesisCard from '@/components/ThesisCard';
import { Panel, Num, Empty, Stat } from '@/components/ui';

export default function Asset({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = use(params);
  const sym = symbol.toUpperCase();
  const inst = bySymbol(sym);
  const { data, loading } = useMarket();

  if (!inst) return <Panel><Empty title="Unknown instrument" body={`${sym} is not covered.`} /></Panel>;

  const q = data?.quotes?.[sym];
  const th = data?.theses?.find(t => t.symbol === sym);
  const noEdge = data?.noEdge?.find(n => n.symbol === sym);

  return (
    <div className="space-y-5">
      <Link href="/markets" className="inline-flex items-center gap-1 text-[11.5px] transition-colors hover:text-[var(--color-secondary)]"
        style={{ color: 'var(--color-quaternary)' }}>
        <ChevronLeft size={13} /> Markets
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-semibold leading-none tracking-tight">{inst.display}</h1>
          <p className="mt-1.5 text-[12.5px]" style={{ color: 'var(--color-tertiary)' }}>{inst.name}</p>
        </div>
        {q && (
          <div className="text-right">
            <div className="num text-[26px] font-semibold leading-none tracking-tight">
              {q.price.toLocaleString(undefined, { minimumFractionDigits: inst.digits, maximumFractionDigits: inst.digits })}
            </div>
            <div className="mt-1.5 flex items-center justify-end gap-2">
              <Num value={q.change} digits={inst.digits} signed colorize className="text-[12px]" />
              <Num value={q.changePct} digits={2} signed suffix="%" colorize className="text-[12px]" />
            </div>
          </div>
        )}
      </div>

      {q && (
        <div className="grid grid-cols-2 gap-px sm:grid-cols-4">
          <Stat label="Day high">{q.high.toFixed(inst.digits)}</Stat>
          <Stat label="Day low">{q.low.toFixed(inst.digits)}</Stat>
          <Stat label="Open">{q.open.toFixed(inst.digits)}</Stat>
          <Stat label="Prev close">{q.prevClose.toFixed(inst.digits)}</Stat>
        </div>
      )}

      <Panel title="Chart" dense>
        <TradingViewChart symbol={inst.tvSymbol} height={520} />
      </Panel>

      <div>
        <h2 className="mb-2.5 text-[15px] font-semibold tracking-tight">Thesis</h2>
        {loading ? <div className="skeleton h-56 w-full" />
          : th ? <ThesisCard t={th} />
          : <Panel><Empty title="No thesis issued"
              body={noEdge?.reason ?? 'Evidence does not currently clear the gates for this instrument.'} /></Panel>}
      </div>

      <Panel title="Structural drivers" dense>
        <div className="divide-y" style={{ borderColor: 'var(--color-hairline)' }}>
          {inst.drivers.map(d => (
            <div key={d} className="px-4 py-2.5 text-[12.5px]" style={{ color: 'var(--color-secondary)' }}>{d}</div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
