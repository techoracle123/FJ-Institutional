'use client';

import React from 'react';
import { Panel, cx } from './ui';
import { useSettings, positionSize } from '@/lib/useSettings';
import { fmtDateTime, ago, zoneAbbr } from '@/lib/time';

type Track = {
  thesisId: string; symbol: string; outcome: string;
  lastPrice: number; lastAt: string; pips: number; r: number;
  mfeR: number; maeR: number; resolvedAt: string | null;
  resolutionReason: string | null; samples: number;
  thesis: {
    id: string; symbol: string; direction: 'long' | 'short';
    conviction: string; probability: number; entry: number;
    stop: number; target: number; rr: number; publishedAt: string;
    regime: string | null; headline: string; klass: string;
  } | null;
};

const OUTCOME_META: Record<string, { label: string; color: string }> = {
  open: { label: 'Running', color: 'var(--color-accent)' },
  target: { label: 'Target hit', color: 'var(--color-long)' },
  stop: { label: 'Stopped', color: 'var(--color-short)' },
  expired: { label: 'Expired', color: 'var(--color-quaternary)' },
  ambiguous: { label: 'Unclear', color: 'var(--color-warn)' },
};

function RBar({ r, mfe, mae }: { r: number; mfe: number; mae: number }) {
  // Visual scale from -1.5R to +3R.
  const lo = -1.5, hi = 3;
  const pct = (v: number) => Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100));
  const zero = pct(0);
  const cur = pct(r);
  const a = pct(mae), b = pct(mfe);

  return (
    <div className="relative h-[6px] w-full rounded-full"
      style={{ background: 'rgba(255,255,255,0.05)' }}>
      {/* excursion range */}
      <div className="absolute top-0 h-full rounded-full"
        style={{ left: `${a}%`, width: `${Math.max(b - a, 0.5)}%`,
          background: 'rgba(255,255,255,0.09)' }} />
      {/* zero marker */}
      <div className="absolute top-[-2px] h-[10px] w-px"
        style={{ left: `${zero}%`, background: 'rgba(255,255,255,0.28)' }} />
      {/* current */}
      <div className="absolute top-[-1px] h-[8px] w-[8px] rounded-full"
        style={{
          left: `calc(${cur}% - 4px)`,
          background: r >= 0 ? 'var(--color-long)' : 'var(--color-short)',
          boxShadow: `0 0 8px ${r >= 0 ? 'var(--color-long)' : 'var(--color-short)'}`,
        }} />
    </div>
  );
}

export function LiveTracker({ data }: { data: any }) {
  const { settings } = useSettings();
  const tz = settings.timezone;
  const open: Track[] = data?.open ?? [];
  const recent: Track[] = data?.recent ?? [];

  return (
    <div className="space-y-4">
      {/* ---- threats + correlated exposure ---- */}
      {(data?.warnings?.length > 0 || data?.threats?.length > 0) && (
        <Panel title="Risk notices" dense>
          <div className="divide-y" style={{ borderColor: 'var(--color-hairline)' }}>
            {data.threats?.map((t: any, i: number) => (
              <div key={`th-${i}`} className="flex gap-3 px-4 py-3">
                <span className="mt-[5px] h-[6px] w-[6px] shrink-0 rounded-full"
                  style={{ background: 'var(--color-warn)' }} />
                <div className="min-w-0">
                  <div className="text-[12.5px]" style={{ color: 'var(--color-primary)' }}>
                    <span className="num">{t.symbol}</span> — {t.reason}
                    {t.kind === 'probability' && (
                      <span className="num" style={{ color: 'var(--color-tertiary)' }}>
                        {' '}({t.from}% → {t.to}%)
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-[11.5px]" style={{ color: 'var(--color-tertiary)' }}>
                    {t.action}
                  </div>
                  <div className="label-xs mt-1" style={{ color: 'var(--color-quaternary)' }}>
                    {fmtDateTime(t.at, tz)} {zoneAbbr(tz)}
                  </div>
                </div>
              </div>
            ))}
            {data.warnings?.map((w: any, i: number) => (
              <div key={`w-${i}`} className="flex gap-3 px-4 py-3">
                <span className="mt-[5px] h-[6px] w-[6px] shrink-0 rounded-full"
                  style={{ background: w.severity === 'high' ? 'var(--color-short)' : 'var(--color-warn)' }} />
                <div className="min-w-0">
                  <div className="text-[12.5px]" style={{ color: 'var(--color-primary)' }}>{w.title}</div>
                  <div className="mt-0.5 text-[11.5px]" style={{ color: 'var(--color-tertiary)' }}>{w.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* ---- running positions ---- */}
      <Panel
        title="Running"
        action={<span className="label-xs" style={{ color: 'var(--color-quaternary)' }}>
          {open.length} open · updated {data?.updatedAt ? ago(data.updatedAt) : '—'}
        </span>}
        dense
      >
        {open.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <div className="text-[13px]" style={{ color: 'var(--color-tertiary)' }}>
              Nothing running.
            </div>
            <div className="mt-1 text-[11.5px]" style={{ color: 'var(--color-quaternary)' }}>
              Theses appear here automatically once published and are tracked every 5 minutes.
            </div>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--color-hairline)' }}>
            {open.map(t => {
              const th = t.thesis;
              if (!th) return null;
              const sz = positionSize(settings.accountSize, settings.riskPct,
                t.symbol, th.entry, th.stop);
              const up = t.r >= 0;
              return (
                <div key={t.thesisId} className="px-4 py-3.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="flex items-baseline gap-2.5">
                      <span className="num text-[14px]" style={{ color: 'var(--color-primary)' }}>
                        {th.symbol}
                      </span>
                      <span className="label-xs uppercase"
                        style={{ color: th.direction === 'long' ? 'var(--color-long)' : 'var(--color-short)' }}>
                        {th.direction}
                      </span>
                      <span className="label-xs" style={{ color: 'var(--color-quaternary)' }}>
                        {th.conviction} · {th.probability}%
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="num text-[15px]"
                        style={{ color: up ? 'var(--color-long)' : 'var(--color-short)' }}>
                        {t.pips > 0 ? '+' : ''}{t.pips} <span className="text-[10px]">pips</span>
                      </div>
                      <div className="num text-[11px]" style={{ color: 'var(--color-tertiary)' }}>
                        {t.r > 0 ? '+' : ''}{t.r.toFixed(2)}R
                      </div>
                    </div>
                  </div>

                  <div className="mt-2.5">
                    <RBar r={t.r} mfe={t.mfeR} mae={t.maeR} />
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                    <Meta k="Entry" v={th.entry} />
                    <Meta k="Now" v={t.lastPrice} />
                    <Meta k="Stop" v={th.stop} />
                    <Meta k="Target" v={th.target} />
                    <Meta k="Best" v={`${t.mfeR.toFixed(2)}R`} raw />
                    <Meta k="Worst" v={`${t.maeR.toFixed(2)}R`} raw />
                    {sz && <Meta k="Size" v={`${sz.lots} lots`} raw />}
                  </div>

                  <div className="label-xs mt-1.5" style={{ color: 'var(--color-quaternary)' }}>
                    published {fmtDateTime(th.publishedAt, tz)} {zoneAbbr(tz)}
                    {' · '}{t.samples} checks
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      {/* ---- settled ---- */}
      <Panel title="Settled" dense>
        {recent.length === 0 ? (
          <div className="px-4 py-6 text-center text-[12px]" style={{ color: 'var(--color-quaternary)' }}>
            No settled theses yet.
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--color-hairline)' }}>
            {recent.map(t => {
              const m = OUTCOME_META[t.outcome] ?? OUTCOME_META.expired;
              const th = t.thesis;
              return (
                <div key={t.thesisId} className="flex items-start gap-3 px-4 py-2.5">
                  <span className="mt-[6px] h-[6px] w-[6px] shrink-0 rounded-full"
                    style={{ background: m.color }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-[12.5px]" style={{ color: 'var(--color-secondary)' }}>
                        <span className="num">{t.symbol}</span>{' '}
                        {th?.direction}{' · '}{m.label}
                      </span>
                      <span className="num text-[12px]"
                        style={{ color: t.r >= 0 ? 'var(--color-long)' : 'var(--color-short)' }}>
                        {t.r > 0 ? '+' : ''}{t.r.toFixed(2)}R
                      </span>
                    </div>
                    {t.resolutionReason && (
                      <div className="mt-0.5 text-[11.5px]" style={{ color: 'var(--color-tertiary)' }}>
                        {t.resolutionReason}
                      </div>
                    )}
                    <div className="label-xs mt-0.5" style={{ color: 'var(--color-quaternary)' }}>
                      {t.resolvedAt ? fmtDateTime(t.resolvedAt, tz) : '—'} {zoneAbbr(tz)}
                      {' · peak '}{t.mfeR.toFixed(2)}R{' · worst '}{t.maeR.toFixed(2)}R
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}

function Meta({ k, v, raw }: { k: string; v: number | string; raw?: boolean }) {
  return (
    <span className="flex items-baseline gap-1">
      <span className="label-xs" style={{ color: 'var(--color-quaternary)' }}>{k}</span>
      <span className="num text-[11.5px]" style={{ color: 'var(--color-secondary)' }}>
        {raw ? v : typeof v === 'number' ? v.toFixed(v > 500 ? 2 : 5).replace(/0+$/, '').replace(/\.$/, '') : v}
      </span>
    </span>
  );
}
