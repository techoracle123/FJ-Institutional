import { NextResponse } from 'next/server';
import {
  fetchLedger, openTracks, resolvedTracks, thesisById,
  calibrationReport, regimeReport, directionalPips, toR,
  type Ledger, type LedgerTrack, type LedgerThesis,
} from '@/lib/ledger';
import { fxDayStart, fxWeekStart } from '@/lib/time';

export const revalidate = 0;
export const dynamic = 'force-dynamic';

/** Correlations of daily changes, measured previously and used to warn about
 *  stacked exposure. Gold/silver in particular are near-duplicates. */
const PAIR_CORR: Record<string, number> = {
  'XAUUSD|XAGUSD': 0.85,
  'EURUSD|GBPUSD': 0.82,
  'EURUSD|XAUUSD': 0.42,
  'GBPUSD|XAUUSD': 0.38,
  'EURUSD|USDJPY': -0.35,
  'GBPUSD|USDJPY': -0.31,
  'XAUUSD|NAS100': -0.18,
  'EURUSD|NAS100': 0.29,
};

function corrOf(a: string, b: string): number {
  if (a === b) return 1;
  return PAIR_CORR[`${a}|${b}`] ?? PAIR_CORR[`${b}|${a}`] ?? 0;
}

type Enriched = LedgerTrack & {
  thesis: LedgerThesis | null;
  ageMs: number;
};

function enrich(l: Ledger, tracks: LedgerTrack[]): Enriched[] {
  const now = Date.now();
  return tracks.map(t => {
    const th = thesisById(l, t.thesisId) ?? null;
    return {
      ...t,
      thesis: th,
      ageMs: th ? now - new Date(th.publishedAt).getTime() : 0,
    };
  });
}

/** Period recap: what we said, what happened, honestly. */
function recap(l: Ledger, sinceMs: number) {
  const inWindow = l.tracks.filter(t => {
    const th = thesisById(l, t.thesisId);
    if (!th) return false;
    return new Date(th.publishedAt).getTime() >= sinceMs;
  });

  const bySymbol = new Map<string, {
    symbol: string; published: number; open: number;
    won: number; lost: number; ambiguous: number; expired: number;
    totalR: number; bestR: number; worstR: number;
    maxMfeR: number; maxMaeR: number;
  }>();

  for (const t of inWindow) {
    const r = bySymbol.get(t.symbol) ?? {
      symbol: t.symbol, published: 0, open: 0, won: 0, lost: 0,
      ambiguous: 0, expired: 0, totalR: 0, bestR: 0, worstR: 0,
      maxMfeR: 0, maxMaeR: 0,
    };
    r.published++;
    if (t.outcome === 'open') r.open++;
    else if (t.outcome === 'target') { r.won++; r.totalR += t.r; }
    else if (t.outcome === 'stop') { r.lost++; r.totalR += t.r; }
    else if (t.outcome === 'ambiguous') { r.ambiguous++; r.totalR += t.r; }
    else if (t.outcome === 'expired') { r.expired++; r.totalR += t.r; }
    r.bestR = Math.max(r.bestR, t.r);
    r.worstR = Math.min(r.worstR, t.r);
    r.maxMfeR = Math.max(r.maxMfeR, t.mfeR);
    r.maxMaeR = Math.min(r.maxMaeR, t.maeR);
    bySymbol.set(t.symbol, r);
  }

  const rows = [...bySymbol.values()].map(r => ({
    ...r,
    totalR: Math.round(r.totalR * 100) / 100,
    bestR: Math.round(r.bestR * 100) / 100,
    worstR: Math.round(r.worstR * 100) / 100,
    maxMfeR: Math.round(r.maxMfeR * 100) / 100,
    maxMaeR: Math.round(r.maxMaeR * 100) / 100,
    decided: r.won + r.lost,
    hitRate: r.won + r.lost > 0 ? Math.round((r.won / (r.won + r.lost)) * 1000) / 10 : null,
  })).sort((a, b) => b.published - a.published);

  const decided = rows.reduce((s, r) => s + r.decided, 0);
  const won = rows.reduce((s, r) => s + r.won, 0);

  return {
    rows,
    published: inWindow.length,
    decided,
    won,
    hitRate: decided ? Math.round((won / decided) * 1000) / 10 : null,
    totalR: Math.round(rows.reduce((s, r) => s + r.totalR, 0) * 100) / 100,
  };
}

export async function GET() {
  try {
    const ledger = await fetchLedger(30);

    const open = enrich(ledger, openTracks(ledger));
    const recent = enrich(
      ledger,
      resolvedTracks(ledger)
        .sort((a, b) => (b.resolvedAt ?? '').localeCompare(a.resolvedAt ?? ''))
        .slice(0, 40)
    );

    // ---- correlated exposure: stacked risk the user cannot see ----
    const warnings: {
      kind: string; severity: 'high' | 'medium';
      title: string; detail: string; symbols: string[];
    }[] = [];

    for (let i = 0; i < open.length; i++) {
      for (let j = i + 1; j < open.length; j++) {
        const a = open[i], b = open[j];
        if (!a.thesis || !b.thesis) continue;
        const rho = corrOf(a.symbol, b.symbol);
        const sameWay = a.thesis.direction === b.thesis.direction;
        // Correlated + same direction, OR anti-correlated + opposite direction,
        // both concentrate rather than diversify risk.
        const stacked = (rho >= 0.6 && sameWay) || (rho <= -0.6 && !sameWay);
        if (!stacked) continue;
        warnings.push({
          kind: 'correlated_exposure',
          severity: Math.abs(rho) >= 0.8 ? 'high' : 'medium',
          title: `${a.symbol} and ${b.symbol} are one risk, not two`,
          detail:
            `These move together (${Math.round(Math.abs(rho) * 100)}% of variance shared). ` +
            `Taking both ${a.thesis.direction === 'long' ? 'longs' : 'shorts'} is effectively ` +
            `a single position at roughly double size. Size them as one unit.`,
          symbols: [a.symbol, b.symbol],
        });
      }
    }

    // ---- threats: material change against an open thesis ----
    const threats = ledger.revisions
      .filter(r => open.some(o => o.thesisId === r.thesisId))
      .filter(r => {
        if (r.kind === 'probability') {
          return Number(r.to) < Number(r.from) - 3;   // materially worse
        }
        return r.kind === 'regime' || r.kind === 'threat';
      })
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 20)
      .map(r => {
        const t = open.find(o => o.thesisId === r.thesisId);
        return {
          ...r,
          symbol: t?.symbol ?? '',
          direction: t?.thesis?.direction ?? null,
          action:
            r.kind === 'probability'
              ? 'Probability fell after publication. Consider tightening to breakeven or reducing size.'
              : r.kind === 'regime'
                ? 'Market structure changed under this position. The original premise may no longer hold.'
                : 'Review this position.',
        };
      });

    return NextResponse.json({
      ok: true,
      updatedAt: ledger.updatedAt,
      open,
      recent,
      warnings,
      threats,
      today: recap(ledger, fxDayStart()),
      week: recap(ledger, fxWeekStart()),
      calibration: calibrationReport(ledger),
      regimes: regimeReport(ledger),
      counts: {
        theses: ledger.theses.length,
        open: open.length,
        resolved: resolvedTracks(ledger).length,
      },
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120' },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
