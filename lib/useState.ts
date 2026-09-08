'use client';
import { useEffect, useState } from 'react';
import type { MarketState } from './engines';
import type { Thesis } from './types';

export type FullState = MarketState & {
  ok: boolean;
  theses: Thesis[];
  noEdge: { symbol: string; reason: string }[];
  summary?: import('./summary').Summary;
};

export function useMarket(pollMs = 60_000) {
  const [data, setData] = useState<FullState | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch('/api/state', { cache: 'no-store' });
        const j = await r.json();
        if (!alive) return;
        if (j.ok) { setData(j); setErr(null); }
        else setErr(j.error ?? 'Failed to load');
      } catch (e) {
        if (alive) setErr((e as Error).message);
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    const t = setInterval(load, pollMs);
    return () => { alive = false; clearInterval(t); };
  }, [pollMs]);

  return { data, err, loading };
}
