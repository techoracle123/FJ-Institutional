'use client';

import React from 'react';
import { Panel } from './ui';
import { useSettings } from '@/lib/useSettings';
import { COMMON_ZONES, detectZone, zoneAbbr, fmtTime, isValidZone } from '@/lib/time';

/**
 * Preferences. Timezone defaults to the browser's IANA zone so a user in
 * Lagos immediately sees WAT rather than being asked to pick from a list of
 * 400 before seeing anything. Stored as an IANA name, never a fixed offset,
 * so DST stays correct.
 */
export function SettingsPanel() {
  const { settings, update, ready } = useSettings();
  const [now, setNow] = React.useState<string>('');

  React.useEffect(() => {
    const tick = () => setNow(new Date().toISOString());
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  if (!ready) return <div className="panel h-48 animate-pulse" />;

  const detected = detectZone();
  // Show common zones plus the detected one if it is not already listed.
  const zones = COMMON_ZONES.includes(detected as any)
    ? [...COMMON_ZONES]
    : [detected, ...COMMON_ZONES];

  return (
    <Panel title="Preferences" dense>
      <div className="space-y-5 px-4 py-4">
        {/* ---- timezone ---- */}
        <div>
          <label className="label-xs block" style={{ color: 'var(--color-quaternary)' }}>
            Timezone
          </label>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <select
              value={settings.timezone}
              onChange={e => isValidZone(e.target.value) && update({ timezone: e.target.value })}
              className="num rounded-[3px] px-2.5 py-1.5 text-[12.5px] outline-none"
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-hairline)',
                color: 'var(--color-primary)',
              }}
            >
              {zones.map(z => (
                <option key={z} value={z}>{z}</option>
              ))}
            </select>
            <span className="num text-[12.5px]" style={{ color: 'var(--color-accent)' }}>
              {now ? fmtTime(now, settings.timezone, true) : '—'}
            </span>
            <span className="label-xs" style={{ color: 'var(--color-quaternary)' }}>
              {zoneAbbr(settings.timezone)}
            </span>
            {settings.timezone !== detected && (
              <button
                onClick={() => update({ timezone: detected })}
                className="label-xs rounded px-2 py-1"
                style={{ color: 'var(--color-accent)', border: '1px solid var(--color-hairline)' }}
              >
                Use {detected}
              </button>
            )}
          </div>
          <p className="mt-1.5 text-[11.5px]" style={{ color: 'var(--color-quaternary)' }}>
            All timestamps are stored in UTC and converted for display, so your history stays
            correct if you travel or the clocks change. Trading days still roll at 17:00 New York,
            which is when the FX day actually turns over.
          </p>
        </div>

        {/* ---- risk ---- */}
        <div className="border-t pt-4" style={{ borderColor: 'var(--color-hairline)' }}>
          <label className="label-xs block" style={{ color: 'var(--color-quaternary)' }}>
            Position sizing
          </label>
          <div className="mt-1.5 flex flex-wrap items-end gap-3">
            <div>
              <div className="label-xs mb-1" style={{ color: 'var(--color-quaternary)' }}>
                Account size
              </div>
              <input
                type="number"
                min={0}
                step={100}
                placeholder="e.g. 10000"
                value={settings.accountSize ?? ''}
                onChange={e => {
                  const v = e.target.value === '' ? null : Number(e.target.value);
                  update({ accountSize: v != null && v > 0 ? v : null });
                }}
                className="num w-36 rounded-[3px] px-2.5 py-1.5 text-[12.5px] outline-none"
                style={{
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-hairline)',
                  color: 'var(--color-primary)',
                }}
              />
            </div>
            <div>
              <div className="label-xs mb-1" style={{ color: 'var(--color-quaternary)' }}>
                Risk per trade
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={0.1}
                  max={10}
                  step={0.1}
                  value={settings.riskPct}
                  onChange={e => {
                    const v = Number(e.target.value);
                    if (v > 0 && v <= 10) update({ riskPct: v });
                  }}
                  className="num w-20 rounded-[3px] px-2.5 py-1.5 text-[12.5px] outline-none"
                  style={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-hairline)',
                    color: 'var(--color-primary)',
                  }}
                />
                <span className="text-[12.5px]" style={{ color: 'var(--color-tertiary)' }}>%</span>
              </div>
            </div>
          </div>
          <p className="mt-1.5 text-[11.5px]" style={{ color: 'var(--color-quaternary)' }}>
            Used to show exact position size on every thesis. You execute with your own broker —
            we never place trades.
          </p>
        </div>
      </div>
    </Panel>
  );
}
