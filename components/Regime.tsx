'use client';
import type { RegimeState } from '@/lib/types';
import { Panel, Meter, Spark, ObsDot } from './ui';

const LABEL: Record<string, string> = {
  'risk-on': 'Risk-On', 'neutral': 'Neutral', 'risk-off': 'Risk-Off',
  'risk-off-transition': 'Risk-Off Transition', 'crisis': 'Crisis',
  compressed: 'Compressed', normal: 'Normal', expanded: 'Expanded', stressed: 'Stressed',
  bullish: 'Bullish', bearish: 'Bearish',
  'strongly-bullish': 'Strongly Bullish', 'strongly-bearish': 'Strongly Bearish',
  expanding: 'Expanding', stable: 'Stable', contracting: 'Contracting',
};

const toneFor = (k: string, v: string) => {
  if (k === 'risk') return v === 'risk-on' ? 'var(--color-long)' : v === 'neutral' ? 'var(--color-secondary)' : v === 'crisis' ? 'var(--color-short)' : 'var(--color-warn)';
  if (k === 'vol') return v === 'compressed' ? 'var(--color-long)' : v === 'normal' ? 'var(--color-secondary)' : v === 'expanded' ? 'var(--color-warn)' : 'var(--color-short)';
  if (k === 'dollar') return v.includes('bearish') ? 'var(--color-short)' : v.includes('bullish') ? 'var(--color-long)' : 'var(--color-secondary)';
  return v === 'expanding' ? 'var(--color-long)' : v === 'stable' ? 'var(--color-secondary)' : v === 'contracting' ? 'var(--color-warn)' : 'var(--color-short)';
};

export default function Regime({ r, spark }: { r: RegimeState; spark?: number[] }) {
  const dials = [
    { k: 'risk', label: 'Risk Regime', v: r.risk, c: r.riskConfidence },
    { k: 'vol', label: 'Volatility', v: r.vol, c: r.volConfidence },
    { k: 'dollar', label: 'Dollar', v: r.dollar, c: r.dollarConfidence },
    { k: 'liquidity', label: 'Liquidity', v: r.liquidity, c: r.liquidityConfidence },
  ];

  return (
    <Panel dense className="relative overflow-hidden">
      <div className="grid-bg pointer-events-none absolute inset-0 opacity-[0.35]" />
      <div className="relative">
        <div className="grid grid-cols-2 divide-x divide-y lg:grid-cols-4 lg:divide-y-0"
          style={{ borderColor: 'var(--color-hairline)' }}>
          {dials.map(d => {
            const color = toneFor(d.k, d.v);
            return (
              <div key={d.k} className="px-4 py-3.5" style={{ borderColor: 'var(--color-hairline)' }}>
                <div className="label">{d.label}</div>
                <div className="mt-1.5 text-[16px] font-semibold leading-tight tracking-tight" style={{ color }}>
                  {LABEL[d.v] ?? d.v}
                </div>
                <div className="mt-2.5 flex items-center gap-2">
                  <Meter value={d.c} color={color} height={2} />
                  <span className="num shrink-0 text-[10.5px]" style={{ color: 'var(--color-tertiary)' }}>{d.c}%</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Dominant driver */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t px-4 py-3"
          style={{ borderColor: 'var(--color-hairline)' }}>
          <div className="min-w-0 flex-1">
            <div className="label flex items-center gap-1.5">
              Dominant driver right now <ObsDot obs="derived" size={4} />
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="truncate text-[13.5px] font-medium">{r.dominantDriver}</span>
              <span className="num shrink-0 text-[11px]" style={{ color: 'var(--color-accent)' }}>
                {r.dominantDriverStrength}% strength
              </span>
            </div>
          </div>
          {spark && spark.length > 2 && (
            <div className="shrink-0">
              <div className="label mb-1">10Y Real Yield · 90d</div>
              <Spark data={spark} width={120} height={26} />
            </div>
          )}
        </div>

        {/* Narrative */}
        <div className="border-t px-4 py-3" style={{ borderColor: 'var(--color-hairline)' }}>
          <div className="label mb-1.5">Market narrative</div>
          <p className="text-[12.5px] leading-relaxed" style={{ color: 'var(--color-secondary)' }}>{r.narrative}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="text-[11px]" style={{ color: 'var(--color-quaternary)' }}>
              Shift: <b style={{ color: r.narrativeShift === 'accelerating' ? 'var(--color-warn)' : 'var(--color-secondary)' }}>{r.narrativeShift}</b>
            </span>
            <span className="text-[11px]" style={{ color: 'var(--color-quaternary)' }}>
              Confidence: <b style={{ color: 'var(--color-secondary)' }}>{r.narrativeConfidence}%</b>
            </span>
          </div>
        </div>

        {/* Contributors */}
        <div className="border-t px-4 py-3" style={{ borderColor: 'var(--color-hairline)' }}>
          <div className="label mb-2">Regime contributors</div>
          <div className="space-y-1.5">
            {r.drivers.slice(0, 5).map(d => (
              <div key={d.name} className="flex items-center gap-3">
                <span className="w-[168px] shrink-0 truncate text-[11.5px]" style={{ color: 'var(--color-secondary)' }}>{d.name}</span>
                <div className="h-[3px] flex-1 overflow-hidden rounded-full" style={{ background: 'var(--color-hairline)' }}>
                  <i className="block h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${Math.min(d.weight * 2.6, 100)}%`,
                      background: d.direction === 'supports' ? 'var(--color-long)' : 'var(--color-short)',
                    }} />
                </div>
                <span className="num w-8 shrink-0 text-right text-[10.5px]" style={{ color: 'var(--color-tertiary)' }}>{d.weight}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Panel>
  );
}
