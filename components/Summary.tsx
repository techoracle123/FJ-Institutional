'use client';
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cx } from './ui';

interface S {
  headline: string;
  paragraphs: string[];
  bullets: { label: string; text: string; tone: 'pos' | 'neg' | 'neutral' | 'warn' }[];
  bottomLine: string;
}

const TONE: Record<string, string> = {
  pos: 'var(--color-long)', neg: 'var(--color-short)',
  warn: 'var(--color-warn)', neutral: 'var(--color-quaternary)',
};

export default function Summary({ s }: { s: S }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="panel-lit overflow-hidden">
      <div className="px-4 pt-3.5 pb-3 sm:px-5">
        <div className="label mb-2">What's happening</div>
        <p className="text-[15.5px] font-medium leading-snug tracking-tight">{s.headline}</p>

        <div className="mt-3 space-y-1.5">
          {s.bullets.map((b, i) => (
            <div key={i} className="flex gap-2.5 text-[12.5px] leading-relaxed">
              <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full" style={{ background: TONE[b.tone] }} />
              <span>
                <span className="font-medium" style={{ color: TONE[b.tone] }}>{b.label}:</span>{' '}
                <span style={{ color: 'var(--color-secondary)' }}>{b.text}</span>
              </span>
            </div>
          ))}
        </div>

        <div className={cx('grid transition-all duration-300', open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0')}>
          <div className="overflow-hidden">
            <div className="mt-3 space-y-2.5 border-t pt-3" style={{ borderColor: 'var(--color-hairline)' }}>
              {s.paragraphs.map((p, i) => (
                <p key={i} className="text-[12.5px] leading-relaxed" style={{ color: 'var(--color-secondary)' }}>{p}</p>
              ))}
            </div>
          </div>
        </div>

        <button onClick={() => setOpen(!open)}
          className="mt-2.5 flex items-center gap-1 text-[11.5px] font-medium transition-colors hover:text-[var(--color-accent)]"
          style={{ color: 'var(--color-tertiary)' }}>
          {open ? 'Less detail' : 'Why this is happening'}
          <ChevronDown size={12} className={cx('transition-transform', open && 'rotate-180')} />
        </button>
      </div>

      <div className="border-t px-4 py-3 sm:px-5"
        style={{ borderColor: 'var(--color-hairline)', background: 'var(--color-void)' }}>
        <div className="label mb-1.5">Bottom line</div>
        <p className="text-[12.5px] leading-relaxed" style={{ color: 'var(--color-secondary)' }}>{s.bottomLine}</p>
      </div>
    </div>
  );
}
