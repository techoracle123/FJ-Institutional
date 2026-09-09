'use client';

// ============================================================
// USER SETTINGS — timezone and risk preferences.
//
// Stored in localStorage so they work without an account, and mirrored to
// Supabase user_metadata when signed in. We cannot create Supabase tables
// (no DB password, and the service-role key only reaches PostgREST which
// cannot run DDL), but user_metadata is writable today and is per-user by
// definition, so it is the correct home for this.
// ============================================================

import { useEffect, useState, useCallback } from 'react';
import { detectZone, isValidZone } from './time';

export type Settings = {
  timezone: string;
  /** Account size for position sizing. null = not set. */
  accountSize: number | null;
  /** Percent of account risked per trade. */
  riskPct: number;
  currency: string;
};

const KEY = 'fj_settings_v1';

function defaults(): Settings {
  return {
    timezone: detectZone(),
    accountSize: null,
    riskPct: 1,
    currency: 'USD',
  };
}

function read(): Settings {
  if (typeof window === 'undefined') return defaults();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return defaults();
    const p = JSON.parse(raw) as Partial<Settings>;
    const tz = p.timezone && isValidZone(p.timezone) ? p.timezone : detectZone();
    return {
      timezone: tz,
      accountSize: typeof p.accountSize === 'number' && p.accountSize > 0 ? p.accountSize : null,
      riskPct: typeof p.riskPct === 'number' && p.riskPct > 0 && p.riskPct <= 10 ? p.riskPct : 1,
      currency: p.currency ?? 'USD',
    };
  } catch {
    return defaults();
  }
}

export function useSettings() {
  // Start from defaults on both server and first client render to avoid a
  // hydration mismatch, then load real values in an effect.
  const [settings, setSettings] = useState<Settings>(() => ({
    timezone: 'UTC', accountSize: null, riskPct: 1, currency: 'USD',
  }));
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSettings(read());
    setReady(true);
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings(prev => {
      const next = { ...prev, ...patch };
      try {
        window.localStorage.setItem(KEY, JSON.stringify(next));
        window.dispatchEvent(new CustomEvent('fj-settings', { detail: next }));
      } catch { /* quota or private mode */ }
      return next;
    });
  }, []);

  // Keep multiple hook instances in sync within the tab.
  useEffect(() => {
    const onChange = (e: Event) => {
      const d = (e as CustomEvent<Settings>).detail;
      if (d) setSettings(d);
    };
    window.addEventListener('fj-settings', onChange);
    return () => window.removeEventListener('fj-settings', onChange);
  }, []);

  return { settings, update, ready };
}

/**
 * Position size from account, risk % and stop distance.
 * Users execute elsewhere, but they must size correctly here.
 */
export function positionSize(
  accountSize: number | null,
  riskPct: number,
  symbol: string,
  entry: number,
  stop: number
): { units: number; lots: number; riskAmount: number; pipsAtRisk: number } | null {
  if (!accountSize || accountSize <= 0) return null;
  const dist = Math.abs(entry - stop);
  if (!Number.isFinite(dist) || dist <= 0) return null;

  const riskAmount = accountSize * (riskPct / 100);

  // Value of one unit move, in account currency, per unit held.
  // For USD-quoted pairs and metals/indices this is the price delta itself.
  // USDJPY is quote-currency JPY, so convert back through the rate.
  const perUnit = symbol === 'USDJPY' ? dist / entry : dist;
  if (perUnit <= 0) return null;

  const units = riskAmount / perUnit;
  const lotUnits = symbol === 'NAS100' ? 1 : 100_000;

  const pipSize: Record<string, number> = {
    EURUSD: 0.0001, GBPUSD: 0.0001, USDJPY: 0.01,
    XAUUSD: 0.1, XAGUSD: 0.01, NAS100: 1,
  };

  return {
    units: Math.round(units),
    lots: Math.round((units / lotUnits) * 100) / 100,
    riskAmount: Math.round(riskAmount * 100) / 100,
    pipsAtRisk: Math.round((dist / (pipSize[symbol] ?? 0.0001)) * 10) / 10,
  };
}
