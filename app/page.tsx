'use client';
import Link from 'next/link';
import { ArrowUpRight, TrendingUp, TrendingDown, Minus, AlertOctagon } from 'lucide-react';
import { useMarket } from '@/lib/useState';
import { bySymbol, INSTRUMENTS } from '@/lib/types';
import Regime from '@/components/Regime';
import ThesisCard from '@/components/ThesisCard';
import { Panel, Num, ObsDot, ObsLegend, Empty, Pill, cx, Spark } from '@/components/ui';

function QuoteStrip({ quotes }: { quotes: Record<string, any> }) {
  return (
    <div className="scrollbar-none -mx-4 flex gap-px overflow-x-auto px-4 sm:mx-0 sm:px-0">
      {INSTRUMENTS.map(i => {
        const q = quotes[i.symbol];
        const up = q && q.changePct >= 0;
        return (
          <Link key={i.symbol} href={`/markets/${i.symbol}`}
            className="panel group min-w-[152px] flex-1 px-3.5 py-2.5 transition-colors hover:bg-[var(--color-raised)]">
            <div className="flex items-center justify-between">
              <span className="text-[11.5px] font-semibold tracking-tight">{i.display}</span>
              <ArrowUpRight size={11} className="opacity-0 transition-opacity group-hover:opacity-60" />
            </div>
            {q ? (
              <>
                <div className="num mt-1 text-[16px] font-semibold tracking-tight">
                  {q.price.toLocaleString(undefined, { minimumFractionDigits: i.digits, maximumFractionDigits: i.digits })}
                </div>
                <div className="mt-0.5 flex items-center gap-1">
                  {up ? <TrendingUp size={10} style={{ color: 'var(--color-long)' }} />
                      : <TrendingDown size={10} style={{ color: 'var(--color-short)' }} />}
                  <Num value={q.changePct} digits={2} signed suffix="%" colorize className="text-[11px]" />
                </div>
              </>
            ) : (
              <div className="mt-1.5 space-y-1"><div className="skeleton h-4 w-20" /><div className="skeleton h-2.5 w-12" /></div>
            )}
          </Link>
        );
      })}
    </div>
  );
}

export default function Now() {
  const { data, loading, err } = useMarket();

  if (loading) return (
    <div className="space-y-4">
      <div className="skeleton h-20 w-full" />
      <div className="skeleton h-52 w-full" />
      <div className="skeleton h-64 w-full" />
    </div>
  );

  if (err || !data) return (
    <Panel><Empty title="Data unavailable" body={err ?? 'Could not reach the intelligence layer.'}
      icon={<AlertOctagon size={26} />} /></Panel>
  );

  const top = data.theses.slice(0, 3);
  const realSpark = data.macro.seriesReal10y?.map((s: any) => s.value) ?? [];

  return (
    <div className="space-y-5">
      {/* Masthead */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold leading-none tracking-tight">Market Now</h1>
          <p className="mt-1.5 text-[12.5px]" style={{ color: 'var(--color-tertiary)' }}>
            {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            {' · '}macro as of {data.macro.asOf}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="label">Data confidence</div>
            <div className="num text-[15px] font-semibold"
              style={{ color: data.dataConfidence > 92 ? 'var(--color-long)' : 'var(--color-warn)' }}>
              {data.dataConfidence}%
            </div>
          </div>
          <ObsLegend />
        </div>
      </div>

      <QuoteStrip quotes={data.quotes} />

      <Regime r={data.regime} spark={realSpark} />

      {/* What changed */}
      {data.changed.length > 0 && (
        <Panel title="What changed" action={<span className="label-xs" style={{ color: 'var(--color-quaternary)' }}>SINCE PRIOR SESSION</span>} dense>
          <div className="divide-y" style={{ borderColor: 'var(--color-hairline)' }}>
            {data.changed.map((c: any, i: number) => (
              <div key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5">
                <span className="w-[136px] shrink-0 text-[12px] font-medium">{c.field}</span>
                <span className="num text-[12px]" style={{ color: 'var(--color-quaternary)' }}>{c.from}</span>
                <span style={{ color: 'var(--color-quaternary)' }}>→</span>
                <span className="num text-[12.5px] font-medium"
                  style={{ color: c.direction === 'up' ? 'var(--color-long)' : c.direction === 'down' ? 'var(--color-short)' : 'var(--color-secondary)' }}>
                  {c.to}
                </span>
                <span className="min-w-0 flex-1 text-[11.5px]" style={{ color: 'var(--color-tertiary)' }}>{c.reason}</span>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* Opportunities */}
      <div>
        <div className="mb-2.5 flex items-baseline justify-between">
          <h2 className="text-[15px] font-semibold tracking-tight">Best opportunities</h2>
          <Link href="/opportunities" className="text-[11.5px] font-medium transition-colors hover:text-[var(--color-accent)]"
            style={{ color: 'var(--color-tertiary)' }}>View all →</Link>
        </div>
        {top.length ? (
          <div className="space-y-3">{top.map((t: any, i: number) => <ThesisCard key={t.id} t={t} rank={i + 1} />)}</div>
        ) : (
          <Panel>
            <Empty
              title="No high-conviction opportunities right now"
              body="That is a position. Evidence across the twelve causal layers is conflicting or liquidity is insufficient. We would rather say nothing than manufacture an edge that isn't there."
              icon={<Minus size={26} />}
            />
          </Panel>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Anomalies */}
        <Panel title="Anomaly detection" dense>
          {data.anomalies.length ? (
            <div className="divide-y" style={{ borderColor: 'var(--color-hairline)' }}>
              {data.anomalies.map((a: any) => (
                <div key={a.id} className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full"
                      style={{ background: a.severity === 'high' ? 'var(--color-short)' : 'var(--color-warn)' }} />
                    <span className="text-[12.5px] font-medium">{a.title}</span>
                    <ObsDot obs={a.obs} size={4} />
                  </div>
                  <p className="num mt-1.5 text-[11.5px]" style={{ color: 'var(--color-secondary)' }}>{a.detail}</p>
                  <div className="mt-2 space-y-1 text-[11.5px]">
                    <p style={{ color: 'var(--color-quaternary)' }}><b style={{ color: 'var(--color-tertiary)' }}>Normally:</b> {a.normalRelation}</p>
                    <p style={{ color: 'var(--color-secondary)' }}><b style={{ color: 'var(--color-accent)' }}>Reading:</b> {a.interpretation}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty title="No relationship breaks detected" body="Cross-asset relationships are behaving within historical norms. Divergences are flagged here the moment they appear." />
          )}
        </Panel>

        {/* Cross-asset */}
        <Panel title="Cross-asset board" dense>
          <div className="divide-y" style={{ borderColor: 'var(--color-hairline)' }}>
            {data.crossAsset.map((r: any) => (
              <div key={r.symbol} className="flex items-center gap-3 px-4 py-2">
                <ObsDot obs={r.obs} size={4} />
                <span className="w-[112px] shrink-0 truncate text-[11.5px]" style={{ color: 'var(--color-secondary)' }}>{r.label}</span>
                <span className="num w-[62px] shrink-0 text-right text-[12px] font-medium">
                  {r.value.toFixed(r.unit === '%' ? 3 : 2)}{r.unit === '%' ? '%' : ''}
                </span>
                <span className="w-[58px] shrink-0 text-right">
                  <Num value={r.d1} digits={r.unit === 'bp' ? 0 : 2} signed colorize className="text-[11px]" />
                </span>
                <span className="ml-auto flex shrink-0 items-center gap-1.5">
                  <span className="num text-[10.5px]" style={{ color: 'var(--color-quaternary)' }}>ρ {r.correlation.toFixed(2)}</span>
                  <span className="h-1 w-1 rounded-full"
                    style={{ background: r.corrState === 'intact' ? 'var(--color-long)' : r.corrState === 'weakening' ? 'var(--color-warn)' : 'var(--color-short)' }} />
                </span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* No edge */}
      {data.noEdge.length > 0 && (
        <Panel title="No edge — deliberately not traded" dense>
          <div className="divide-y" style={{ borderColor: 'var(--color-hairline)' }}>
            {data.noEdge.map((n: any) => (
              <div key={n.symbol} className="flex items-baseline gap-3 px-4 py-2">
                <span className="w-[74px] shrink-0 text-[12px] font-medium" style={{ color: 'var(--color-tertiary)' }}>
                  {bySymbol(n.symbol)?.display ?? n.symbol}
                </span>
                <span className="text-[11.5px]" style={{ color: 'var(--color-quaternary)' }}>{n.reason}</span>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <p className="pb-2 text-center text-[10.5px] leading-relaxed" style={{ color: 'var(--color-quaternary)' }}>
        FJ Institutional publishes general market analysis, not personalised investment advice.
        We aggregate, quantify and explain market evidence — we do not predict the future.
        Trading carries substantial risk of loss.
      </p>
    </div>
  );
}
