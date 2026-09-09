'use client';
import { useEffect, useRef, useState } from 'react';

export interface Tick {
  symbol: string; price: number; change: number; changePct: number;
  high: number; low: number; prevClose: number;
  marketTime: number; lagSec: number | null;
  spark: number[]; vol1m: number | null;
}

/**
 * Live price pulse. Polls the lightweight /api/tick endpoint and reports
 * per-symbol direction of the last change so the UI can flash green/red the
 * way a real terminal does.
 */
export function useTicks(ms = 5000) {
  const [ticks, setTicks] = useState<Record<string, Tick>>({});
  const [lag, setLag] = useState<number | null>(null);
  const [flash, setFlash] = useState<Record<string, 'up' | 'down'>>({});
  const prev = useRef<Record<string, number>>({});

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      try {
        const r = await fetch('/api/tick', { cache: 'no-store' });
        const j = await r.json();
        if (!alive || !j.ok) return;

        const f: Record<string, 'up' | 'down'> = {};
        for (const [k, v] of Object.entries(j.ticks as Record<string, Tick>)) {
          const p = prev.current[k];
          if (p != null && v.price !== p) f[k] = v.price > p ? 'up' : 'down';
          prev.current[k] = v.price;
        }
        setTicks(j.ticks);
        setLag(j.medianLagSec);
        if (Object.keys(f).length) {
          setFlash(f);
          setTimeout(() => alive && setFlash({}), 700);
        }
      } catch { /* transient network — keep last good values */ }
      finally {
        if (alive) timer = setTimeout(tick, ms);
      }
    };

    tick();
    return () => { alive = false; clearTimeout(timer); };
  }, [ms]);

  return { ticks, lag, flash };
}
