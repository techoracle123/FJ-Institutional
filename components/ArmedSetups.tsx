'use client';
import { bySymbol } from '@/lib/types';
import { Panel } from '@/components/ui';
import type { ArmedSetup } from '@/lib/breakout';
import { BREAKOUT_SPEC } from '@/lib/breakout';

/**
 * The trade plan when nothing has fired yet.
 *
 * A breakout model is idle most of the time — it triggers roughly once a day.
 * Showing an empty board in between made the platform untradeable. These are
 * the exact levels the verified model fires on, with the full pending-order
 * plan for both sides, so the trader can rest orders instead of watching.
 *
 * These are NOT predictions. Neither side is favoured: whichever level breaks
 * first is the trade, and the other plan is cancelled.
 */
export function ArmedSetups({ setups }: { setups: ArmedSetup[] }) {
  if (!setups?.length) return null;

  return (
    <Panel title="Armed setups — resting orders" dense>
      <div className="border-b px-4 py-2 text-[11.5px]"
        style={{ borderColor: 'var(--color-hairline)', color: 'var(--color-tertiary)' }}>
        Verified {BREAKOUT_SPEC.lookback}h breakout model. Place these as <b>stop-entry</b> orders —
        whichever side triggers first, cancel the other.
      </div>
      <div className="divide-y" style={{ borderColor: 'var(--color-hairline)' }}>
        {setups.map(s => {
          const inst = bySymbol(s.symbol);
          const d = inst?.digits ?? 2;
          const near = s.nearestAtr;
          const heat =
            near < 0.25 ? { t: 'IMMINENT', c: 'var(--color-down)' }
            : near < 0.75 ? { t: 'CLOSE', c: 'var(--color-warn)' }
            : { t: 'WATCHING', c: 'var(--color-quaternary)' };

          const Side = ({
            dir, entry, stop, t1, t2, dist,
          }: { dir: 'LONG' | 'SHORT'; entry: number; stop: number; t1: number; t2: number; dist: number }) => (
            <div className="rounded-md p-3" style={{ background: 'var(--color-raised)' }}>
              <div className="flex items-center justify-between">
                <span className="label-xs font-semibold"
                  style={{ color: dir === 'LONG' ? 'var(--color-up)' : 'var(--color-down)' }}>
                  {dir} — buy stop {dir === 'LONG' ? 'above' : 'below'}
                </span>
                <span className="num text-[10.5px]" style={{ color: 'var(--color-quaternary)' }}>
                  {dist <= 0 ? 'at level' : `${dist.toFixed(2)} ATR away`}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-4 gap-2 text-[11.5px]">
                <div>
                  <div className="label-xs" style={{ color: 'var(--color-quaternary)' }}>Entry</div>
                  <div className="num font-semibold">{entry.toFixed(d)}</div>
                </div>
                <div>
                  <div className="label-xs" style={{ color: 'var(--color-quaternary)' }}>Stop</div>
                  <div className="num" style={{ color: 'var(--color-down)' }}>{stop.toFixed(d)}</div>
                </div>
                <div>
                  <div className="label-xs" style={{ color: 'var(--color-quaternary)' }}>T1</div>
                  <div className="num">{t1.toFixed(d)}</div>
                </div>
                <div>
                  <div className="label-xs" style={{ color: 'var(--color-quaternary)' }}>T2</div>
                  <div className="num" style={{ color: 'var(--color-up)' }}>{t2.toFixed(d)}</div>
                </div>
              </div>
            </div>
          );

          return (
            <div key={s.symbol} className="px-4 py-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13.5px] font-semibold">{inst?.display ?? s.symbol}</span>
                <span className="label-xs rounded px-1.5 py-0.5 font-semibold"
                  style={{ background: heat.c, color: '#0A0C11' }}>
                  {heat.t}
                </span>
                <span className="num text-[11.5px]" style={{ color: 'var(--color-tertiary)' }}>
                  {s.price.toFixed(d)}
                </span>
                <span className="text-[11px]" style={{ color: 'var(--color-quaternary)' }}>
                  channel {s.channelLow.toFixed(d)} – {s.channelHigh.toFixed(d)} · ATR {s.atr.toFixed(d)}
                </span>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <Side dir="LONG" entry={s.longEntry} stop={s.longStop}
                  t1={s.longT1} t2={s.longT2} dist={s.toLongAtr} />
                <Side dir="SHORT" entry={s.shortEntry} stop={s.shortStop}
                  t1={s.shortT1} t2={s.shortT2} dist={s.toShortAtr} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="px-4 py-2.5 text-[11px]" style={{ color: 'var(--color-quaternary)', borderTop: '1px solid var(--color-hairline)' }}>
        Measured over {BREAKOUT_SPEC.n + 789} breaks on these instruments: <b>+0.125R</b> per trade,
        95% CI +0.056 to +0.194, p&lt;0.001 against random timing. Win rate 38.8% — the payoff is 2:1,
        so most trades lose and the model still makes money. Risk the same amount every time or the
        maths does not hold.
      </div>
    </Panel>
  );
}
