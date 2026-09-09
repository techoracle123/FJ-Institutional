'use client';

import { useEffect, useState } from 'react';
import { LiveTracker } from '@/components/LiveTracker';
import { Recap, Calibration } from '@/components/Recap';
import { useSettings } from '@/lib/useSettings';
import { zoneAbbr } from '@/lib/time';

export default function LivePage() {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const { settings } = useSettings();

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch('/api/live')
        .then(r => r.json())
        .then(j => {
          if (!alive) return;
          if (j.ok) { setD(j); setErr(null); } else setErr(j.error ?? 'failed');
        })
        .catch(e => { if (alive) setErr(String(e)); });
    load();
    // The tracker writes every 5 minutes; poll faster so resolutions surface
    // promptly without hammering the API.
    const t = setInterval(load, 30_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[26px] font-semibold leading-none tracking-tight">Live</h1>
        <p className="mt-1.5 text-[13px]" style={{ color: 'var(--color-tertiary)' }}>
          Every published thesis is recorded and tracked to resolution. Times shown in{' '}
          <span className="num">{settings.timezone}</span> ({zoneAbbr(settings.timezone)}).
        </p>
      </div>

      {err && (
        <div className="panel p-4 text-[12.5px]" style={{ color: 'var(--color-short)' }}>
          Could not load tracking data: {err}
        </div>
      )}

      {!d && !err && (
        <div className="space-y-3">
          {[0, 1, 2].map(i => (
            <div key={i} className="panel h-28 animate-pulse" />
          ))}
        </div>
      )}

      {d && (
        <div className="space-y-4">
          <LiveTracker data={d} />
          <Recap today={d.today} week={d.week} />
          <Calibration calibration={d.calibration} regimes={d.regimes} />
        </div>
      )}
    </div>
  );
}
