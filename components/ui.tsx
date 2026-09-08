'use client';
import React from 'react';
import { OBSERVABILITY_META, type Observability } from '@/lib/types';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

/* ---------------- Observability dot ---------------- */
export function ObsDot({ obs, size = 5 }: { obs: Observability; size?: number }) {
  const m = OBSERVABILITY_META[obs];
  return (
    <span
      title={`${m.label} — ${m.desc}`}
      className="inline-block shrink-0 rounded-full align-middle"
      style={{ width: size, height: size, background: m.color, boxShadow: `0 0 6px ${m.color}55` }}
    />
  );
}

export function ObsLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {(Object.keys(OBSERVABILITY_META) as Observability[]).map(k => (
        <span key={k} className="flex items-center gap-1.5" title={OBSERVABILITY_META[k].desc}>
          <ObsDot obs={k} />
          <span className="label-xs" style={{ color: 'var(--color-tertiary)' }}>{OBSERVABILITY_META[k].label}</span>
        </span>
      ))}
    </div>
  );
}

/* ---------------- Panel ---------------- */
export function Panel({
  children, className, title, action, dense, lit = true,
}: {
  children: React.ReactNode; className?: string; title?: string;
  action?: React.ReactNode; dense?: boolean; lit?: boolean;
}) {
  return (
    <section className={cx('panel', lit && 'panel-lit', 'overflow-hidden', className)}>
      {title && (
        <header className="flex items-center justify-between gap-3 border-b px-4 py-2.5"
          style={{ borderColor: 'var(--color-hairline)' }}>
          <h2 className="label">{title}</h2>
          {action}
        </header>
      )}
      <div className={dense ? '' : 'p-4'}>{children}</div>
    </section>
  );
}

/* ---------------- Number ---------------- */
export function Num({
  value, digits = 2, prefix = '', suffix = '', signed = false, className, colorize = false,
}: {
  value: number; digits?: number; prefix?: string; suffix?: string;
  signed?: boolean; className?: string; colorize?: boolean;
}) {
  if (!Number.isFinite(value)) return <span className={cx('num', className)} style={{ color: 'var(--color-quaternary)' }}>—</span>;
  const s = `${signed && value >= 0 ? '+' : ''}${value.toFixed(digits)}`;
  const color = colorize
    ? value > 0 ? 'var(--color-long)' : value < 0 ? 'var(--color-short)' : 'var(--color-secondary)'
    : undefined;
  return <span className={cx('num', className)} style={{ color }}>{prefix}{s}{suffix}</span>;
}

/* ---------------- Confidence meter ---------------- */
export function Meter({ value, color = 'var(--color-accent)', height = 3 }: { value: number; color?: string; height?: number }) {
  return (
    <div className="evbar w-full" style={{ height }}>
      <i style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
    </div>
  );
}

/* ---------------- Evidence bar (−3…+3) ---------------- */
export function EvidenceBar({ score }: { score: number | null }) {
  if (score === null) {
    return <div className="flex h-[3px] w-full items-center"><div className="h-px w-full" style={{ background: 'var(--color-hairline-strong)' }} /></div>;
  }
  const pct = Math.min(Math.abs(score) / 3, 1) * 50;
  const pos = score >= 0;
  return (
    <div className="relative h-[3px] w-full overflow-hidden rounded-full" style={{ background: 'var(--color-hairline)' }}>
      <div className="absolute inset-y-0" style={{ left: '50%', width: 1, background: 'var(--color-hairline-strong)' }} />
      <div
        className="absolute inset-y-0 rounded-full transition-all duration-700"
        style={{
          [pos ? 'left' : 'right']: '50%',
          width: `${pct}%`,
          background: pos ? 'var(--color-long)' : 'var(--color-short)',
        } as React.CSSProperties}
      />
    </div>
  );
}

/* ---------------- Pill ---------------- */
export function Pill({
  children, tone = 'neutral', className,
}: { children: React.ReactNode; tone?: 'neutral' | 'long' | 'short' | 'accent' | 'warn'; className?: string }) {
  const map = {
    neutral: { c: 'var(--color-secondary)', b: 'var(--color-hairline-strong)', bg: 'transparent' },
    long: { c: 'var(--color-long)', b: 'rgba(33,208,122,.3)', bg: 'var(--color-long-dim)' },
    short: { c: 'var(--color-short)', b: 'rgba(255,77,106,.3)', bg: 'var(--color-short-dim)' },
    accent: { c: 'var(--color-accent)', b: 'rgba(34,229,200,.3)', bg: 'var(--color-accent-glow)' },
    warn: { c: 'var(--color-warn)', b: 'rgba(255,176,32,.3)', bg: 'var(--color-warn-dim)' },
  }[tone];
  return (
    <span
      className={cx('inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.09em]', className)}
      style={{ color: map.c, border: `1px solid ${map.b}`, background: map.bg }}
    >{children}</span>
  );
}

/* ---------------- Conviction bars ---------------- */
export function ConvictionBars({ bars, color }: { bars: number; color: string }) {
  return (
    <span className="inline-flex items-end gap-[2px]" aria-label={`${bars} of 4`}>
      {[0, 1, 2, 3].map(i => (
        <i key={i} className="block w-[3px] rounded-[1px] transition-all"
          style={{ height: 5 + i * 3, background: i < bars ? color : 'var(--color-hairline-strong)' }} />
      ))}
    </span>
  );
}

/* ---------------- Sparkline ---------------- */
export function Spark({
  data, width = 88, height = 24, color = 'var(--color-accent)', fill = true,
}: { data: number[]; width?: number; height?: number; color?: string; fill?: boolean }) {
  if (!data || data.length < 2) return <svg width={width} height={height} />;
  const min = Math.min(...data), max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => [
    (i / (data.length - 1)) * width,
    height - ((v - min) / span) * (height - 3) - 1.5,
  ] as const);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const id = React.useId();
  return (
    <svg width={width} height={height} className="overflow-visible">
      {fill && (
        <>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.22" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${d} L${width},${height} L0,${height} Z`} fill={`url(#${id})`} />
        </>
      )}
      <path d={d} fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ---------------- Live dot ---------------- */
export function LiveDot({ ok = true }: { ok?: boolean }) {
  return (
    <span className="relative inline-flex h-1.5 w-1.5">
      <span className={cx('absolute inline-flex h-full w-full rounded-full', ok && 'live-dot')}
        style={{ background: ok ? 'var(--color-long)' : 'var(--color-warn)' }} />
    </span>
  );
}

/* ---------------- Stat ---------------- */
export function Stat({
  label, children, sub, obs,
}: { label: string; children: React.ReactNode; sub?: string; obs?: Observability }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5">
        <span className="label">{label}</span>
        {obs && <ObsDot obs={obs} size={4} />}
      </div>
      <div className="mt-1 truncate text-[15px] font-medium">{children}</div>
      {sub && <div className="mt-0.5 truncate text-[11px]" style={{ color: 'var(--color-tertiary)' }}>{sub}</div>}
    </div>
  );
}

/* ---------------- Empty state ---------------- */
export function Empty({ title, body, icon }: { title: string; body: string; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && <div className="mb-3 opacity-40">{icon}</div>}
      <p className="text-[14px] font-medium">{title}</p>
      <p className="mt-1.5 max-w-md text-[12.5px] leading-relaxed" style={{ color: 'var(--color-tertiary)' }}>{body}</p>
    </div>
  );
}
