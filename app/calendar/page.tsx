'use client';
import { useMarket } from '@/lib/useState';
import { Panel, Empty, cx } from '@/components/ui';
import { useSettings } from '@/lib/useSettings';
import { fmtTime, fmtDate, zoneAbbr } from '@/lib/time';

const IMPACT: Record<string, string> = {
  high: 'var(--color-short)', medium: 'var(--color-warn)', low: 'var(--color-quaternary)',
};

export default function Calendar() {
  const { data, loading } = useMarket();
  const { settings } = useSettings();
  const tz = settings.timezone;
  const evs = data?.calendar ?? [];

  const byDay = evs.reduce<Record<string, typeof evs>>((acc, e) => {
    const d = fmtDate(e.time, tz);
    (acc[d] ||= []).push(e);
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[26px] font-semibold leading-none tracking-tight">Calendar</h1>
        <p className="mt-1.5 text-[12.5px]" style={{ color: 'var(--color-tertiary)' }}>
          Scheduled catalysts. What matters is the surprise versus what is already priced.
        </p>
      </div>

      {loading ? <div className="skeleton h-64 w-full" />
        : Object.keys(byDay).length === 0 ? (
          <Panel><Empty title="No scheduled events in window"
            body="High-impact releases will appear here with consensus, prior and the instruments they transmit to." /></Panel>
        ) : Object.entries(byDay).map(([day, list]) => (
          <Panel key={day} title={day} dense>
            <div className="divide-y" style={{ borderColor: 'var(--color-hairline)' }}>
              {list.map((e, i) => (
                <div key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5">
                  <span className="num w-[52px] shrink-0 text-[11.5px]" style={{ color: 'var(--color-tertiary)' }}>
                    {fmtTime(e.time, tz)}
                  </span>
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: IMPACT[e.impact] ?? IMPACT.low }} />
                  <span className="text-[12.5px] font-medium">{e.title}</span>
                  <span className="label-xs" style={{ color: 'var(--color-quaternary)' }}>{e.currency}</span>
                  <span className="num ml-auto text-[11.5px]" style={{ color: 'var(--color-tertiary)' }}>
                    {e.consensus != null && <>cons {e.consensus}</>}
                    {e.prior != null && <span style={{ color: 'var(--color-quaternary)' }}> · prior {e.prior}</span>}
                  </span>
                </div>
              ))}
            </div>
          </Panel>
        ))}
    </div>
  );
}
