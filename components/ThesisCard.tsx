'use client';
import { useState } from 'react';
import { ChevronDown, AlertTriangle, Clock, Zap, ShieldAlert } from 'lucide-react';
import {
  CONVICTION_META, ENTRY_META, CLASS_META, LAYERS, bySymbol,
  type Thesis, type LayerId,
} from '@/lib/types';
import { cx, Panel, Pill, ConvictionBars, ObsDot, EvidenceBar, Meter, Num } from './ui';

const nameOf = (id: LayerId) => LAYERS.find(l => l.id === id)!;

export default function ThesisCard({ t, rank }: { t: Thesis; rank?: number }) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<LayerId | null>(null);
  const inst = bySymbol(t.symbol)!;
  const cm = CONVICTION_META[t.conviction];
  const em = ENTRY_META[t.entryQuality];
  const long = t.direction === 'long';
  const dirColor = long ? 'var(--color-long)' : 'var(--color-short)';
  const d = inst.digits;

  const active = t.layers.filter(l => l.score !== null);
  const agree = active.filter(l => Math.sign(l.score!) === (long ? 1 : -1) && Math.abs(l.score!) > 0.15).length;

  return (
    <Panel dense className="animate-in">
      {/* ── Header ── */}
      <div className="flex items-start gap-3 px-4 pt-3.5">
        {rank !== undefined && (
          <span className="num mt-0.5 text-[11px]" style={{ color: 'var(--color-quaternary)' }}>
            {String(rank).padStart(2, '0')}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[17px] font-semibold tracking-tight">{inst.display}</h3>
            <Pill tone={long ? 'long' : 'short'}>{long ? 'LONG' : 'SHORT'}</Pill>
            <Pill tone="neutral">{CLASS_META[t.klass].label}</Pill>
            {t.lifecycle === 'forming' && <Pill tone="warn">Forming</Pill>}
            {t.lifecycle === 'watching' && <Pill tone="warn">Watching</Pill>}
          </div>
          <p className="mt-1 text-[11.5px]" style={{ color: 'var(--color-tertiary)' }}>
            {inst.name} · {CLASS_META[t.klass].tf} · expected hold {t.expectedHold}
          </p>
        </div>

        {/* Conviction */}
        <div className="shrink-0 text-right">
          <div className="flex items-center justify-end gap-1.5">
            <ConvictionBars bars={cm.bars} color={cm.color} />
            <span className="num text-[19px] font-semibold leading-none" style={{ color: cm.color }}>{t.conviction}</span>
          </div>
          <p className="mt-1 text-[10px]" style={{ color: 'var(--color-quaternary)' }}>{cm.label}</p>
        </div>
      </div>

      {/* ── The three numbers ── */}
      <div className="mt-3.5 grid grid-cols-3 divide-x border-y" style={{ borderColor: 'var(--color-hairline)' }}>
        {[
          {
            k: 'Probability',
            v: <>
              <span className="num text-[17px] font-semibold">{t.probability}%</span>
              <span className="num ml-1 text-[11px]" style={{ color: 'var(--color-tertiary)' }}>±{t.probabilityCI}</span>
            </>,
            s: `n=${t.analogue.n} analogues · calibrated`,
          },
          {
            k: 'Data Confidence',
            v: <span className="num text-[17px] font-semibold"
              style={{ color: t.dataConfidence > 92 ? 'var(--color-long)' : 'var(--color-warn)' }}>{t.dataConfidence}%</span>,
            s: `model ${t.modelHealth} · ${t.modelVersion}`,
          },
          {
            k: 'Freshness',
            v: <span className="num text-[17px] font-semibold"
              style={{ color: t.freshness > 70 ? 'var(--color-long)' : t.freshness > 45 ? 'var(--color-warn)' : 'var(--color-short)' }}>{t.freshness}%</span>,
            s: `decays to expiry`,
          },
        ].map(x => (
          <div key={x.k} className="px-4 py-2.5" style={{ borderColor: 'var(--color-hairline)' }}>
            <div className="label">{x.k}</div>
            <div className="mt-1">{x.v}</div>
            <div className="mt-0.5 text-[10px]" style={{ color: 'var(--color-quaternary)' }}>{x.s}</div>
          </div>
        ))}
      </div>

      {/* ── Entry quality banner ── */}
      <div className="flex items-center gap-2 px-4 py-2" style={{ background: 'var(--color-base)' }}>
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: em.color }} />
        <span className="label" style={{ color: em.color }}>{em.label} ENTRY</span>
        <span className="text-[11.5px]" style={{ color: 'var(--color-tertiary)' }}>{em.note}</span>
      </div>

      {/* ── Levels ── */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-3.5 sm:grid-cols-4">
        {[
          { k: 'Entry zone', v: `${t.entryLow.toFixed(d)} – ${t.entryHigh.toFixed(d)}`, c: 'var(--color-primary)' },
          { k: 'Invalidation', v: t.stop.toFixed(d), c: 'var(--color-short)' },
          { k: 'Target 1', v: t.t1.toFixed(d), c: 'var(--color-long)' },
          { k: 'Target 2', v: t.t2.toFixed(d), c: 'var(--color-long)' },
        ].map(x => (
          <div key={x.k}>
            <div className="label">{x.k}</div>
            <div className="num mt-0.5 text-[13.5px] font-medium" style={{ color: x.c }}>{x.v}</div>
          </div>
        ))}
      </div>

      {/* ── R:R + EV + acceleration ── */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t px-4 py-2.5"
        style={{ borderColor: 'var(--color-hairline)' }}>
        <span className="flex items-baseline gap-1.5">
          <span className="label">R:R</span>
          <span className="num text-[13px] font-medium">{t.rr.toFixed(2)}</span>
        </span>
        <span className="flex items-baseline gap-1.5">
          <span className="label">Expected value</span>
          <Num value={t.expectedValue} digits={2} signed colorize className="text-[13px] font-medium" />
          <span className="text-[11px]" style={{ color: 'var(--color-quaternary)' }}>R</span>
        </span>
        <span className="flex items-center gap-1.5">
          <Zap size={11} style={{ color: t.accelerationRisk === 'high' ? 'var(--color-warn)' : 'var(--color-quaternary)' }} />
          <span className="label">Acceleration</span>
          <span className="text-[11.5px] font-medium"
            style={{ color: t.accelerationRisk === 'high' ? 'var(--color-warn)' : 'var(--color-secondary)' }}>
            {t.accelerationRisk}
          </span>
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          <span className="label">Evidence</span>
          <span className="num text-[13px] font-medium">{agree}/{active.length}</span>
          <span className="text-[10.5px]" style={{ color: 'var(--color-quaternary)' }}>aligned</span>
        </span>
      </div>

      {/* ── Narrative ── */}
      <div className="px-4 py-3">
        <p className="text-[12.5px] leading-relaxed" style={{ color: 'var(--color-secondary)' }}>{t.narrative}</p>
      </div>

      {/* ── Expand ── */}
      <button onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-center gap-1.5 border-t py-2.5 text-[11.5px] font-medium transition-colors hover:bg-[var(--color-raised)]"
        style={{ borderColor: 'var(--color-hairline)', color: 'var(--color-tertiary)' }}>
        {open ? 'Hide evidence' : 'Show the twelve causal layers'}
        <ChevronDown size={13} className={cx('transition-transform duration-300', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="animate-fade border-t" style={{ borderColor: 'var(--color-hairline)', background: 'var(--color-base)' }}>
          {/* Layers */}
          <div className="divide-y" style={{ borderColor: 'var(--color-hairline)' }}>
            {t.layers.map(l => {
              const meta = nameOf(l.id);
              const isOpen = expanded === l.id;
              const inactive = l.score === null;
              return (
                <div key={l.id}>
                  <button onClick={() => setExpanded(isOpen ? null : l.id)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[var(--color-surface)]">
                    <span className="num w-4 shrink-0 text-[10px]" style={{ color: 'var(--color-quaternary)' }}>
                      {String(meta.n).padStart(2, '0')}
                    </span>
                    <span className="w-[86px] shrink-0 text-[11.5px] font-medium"
                      style={{ color: inactive ? 'var(--color-quaternary)' : 'var(--color-primary)' }}>
                      {meta.name}
                    </span>
                    <ObsDot obs={l.obs} size={4} />
                    <span className="w-[74px] shrink-0"><EvidenceBar score={l.score} /></span>
                    <span className="min-w-0 flex-1 truncate text-[11.5px]"
                      style={{ color: inactive ? 'var(--color-quaternary)' : 'var(--color-secondary)' }}>
                      {l.headline}
                    </span>
                    <ChevronDown size={12} className={cx('shrink-0 transition-transform', isOpen && 'rotate-180')}
                      style={{ color: 'var(--color-quaternary)' }} />
                  </button>
                  {isOpen && (
                    <div className="animate-fade px-4 pb-3.5 pl-[126px]">
                      <p className="text-[11.5px] italic" style={{ color: 'var(--color-quaternary)' }}>{meta.question}</p>
                      <p className="mt-1.5 text-[12px] leading-relaxed" style={{ color: 'var(--color-secondary)' }}>{l.detail}</p>
                      {l.evidence.length > 0 && (
                        <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1.5">
                          {l.evidence.map((e, i) => (
                            <span key={i} className="flex items-center gap-1.5">
                              <ObsDot obs={e.obs} size={3.5} />
                              <span className="label-xs">{e.label}</span>
                              <span className="num text-[11.5px]" style={{ color: 'var(--color-primary)' }}>{e.value}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Analogues */}
          <div className="border-t px-4 py-3.5" style={{ borderColor: 'var(--color-hairline)' }}>
            <div className="label mb-2.5">Historical analogues</div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { k: 'Sample', v: `n=${t.analogue.n}` },
                { k: 'Hit rate', v: `${t.analogue.hitRate}%` },
                { k: 'Median MFE', v: `${t.analogue.medianMFE}R` },
                { k: 'Median hold', v: t.analogue.medianHoldHours < 24 ? `${t.analogue.medianHoldHours}h` : `${(t.analogue.medianHoldHours / 24).toFixed(1)}d` },
              ].map(x => (
                <div key={x.k}>
                  <div className="label-xs" style={{ color: 'var(--color-quaternary)' }}>{x.k}</div>
                  <div className="num mt-0.5 text-[13px] font-medium">{x.v}</div>
                </div>
              ))}
            </div>
            <p className="mt-2.5 text-[11px]" style={{ color: 'var(--color-quaternary)' }}>
              Conditional frequency from similar historical states. Not a forecast — an empirical base rate.
            </p>
          </div>

          {/* Why now */}
          <div className="border-t px-4 py-3.5" style={{ borderColor: 'var(--color-hairline)' }}>
            <div className="label mb-2 flex items-center gap-1.5"><Clock size={11} /> Why now</div>
            <ul className="space-y-1.5">
              {t.whyNow.map((w, i) => (
                <li key={i} className="flex gap-2 text-[12px]" style={{ color: 'var(--color-secondary)' }}>
                  <span style={{ color: 'var(--color-accent)' }}>▸</span>{w}
                </li>
              ))}
            </ul>
          </div>

          {/* Invalidation */}
          <div className="border-t px-4 py-3.5" style={{ borderColor: 'var(--color-hairline)', background: 'rgba(255,77,106,0.035)' }}>
            <div className="label mb-2 flex items-center gap-1.5" style={{ color: 'var(--color-short)' }}>
              <ShieldAlert size={11} /> What makes this wrong
            </div>
            <ul className="space-y-1.5">
              {t.invalidation.map((v, i) => (
                <li key={i} className="flex gap-2 text-[12px]" style={{ color: 'var(--color-secondary)' }}>
                  <span style={{ color: 'var(--color-short)' }}>✕</span>{v}
                </li>
              ))}
            </ul>
            <p className="mt-2.5 flex items-start gap-1.5 text-[11.5px]" style={{ color: 'var(--color-tertiary)' }}>
              <AlertTriangle size={11} className="mt-0.5 shrink-0" style={{ color: 'var(--color-warn)' }} />
              <span><b style={{ color: 'var(--color-secondary)' }}>Main risk:</b> {t.mainRisk}</span>
            </p>
          </div>
        </div>
      )}
    </Panel>
  );
}
