/**
 * Exit-discipline data, precomputed nightly by scripts/exitlab.mjs.
 *
 * Why this is the product: entry timing carries no measurable information
 * (every entry model tested scores p=0.24-0.47 vs a direction-matched
 * placebo), but exit discipline is measurable, large and under the trader's
 * control. Paired on identical entries, moving from "breakeven at +1R" to a
 * trailing ATR stop is worth +0.13R to +0.42R per trade at t=9.9 to t=20.3.
 */
export interface ExitRule {
  id: string;
  label: string;
  expectancy: number;
  hitRate: number;
  profitFactor: number;
  tStat: number;
  vsBreakeven: number;
  vsBreakevenT: number;
}

export interface ExitLab {
  generatedAt: string;
  costR: number;
  sampleSize: number;
  instruments: Record<string, { best: string; rules: ExitRule[] }>;
}

const REPO = 'techoracle123/FJ-Institutional';
const PATH = 'data/exitlab.json';

let cache: ExitLab | null = null;
let at = 0;

export async function fetchExitLab(): Promise<ExitLab | null> {
  if (cache && Date.now() - at < 1_800_000) return cache;
  const token = process.env.GITHUB_TOKEN ?? '';
  try {
    const r = token
      ? await fetch(`https://api.github.com/repos/${REPO}/contents/${PATH}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github.raw',
            'User-Agent': 'FJInstitutional',
          },
          next: { revalidate: 1800 },
        })
      : await fetch(`https://raw.githubusercontent.com/${REPO}/main/${PATH}`, { next: { revalidate: 1800 } });
    if (r.ok) {
      const j = (await r.json()) as ExitLab;
      if (j?.instruments) { cache = j; at = Date.now(); return j; }
    }
  } catch { /* fall through */ }
  return cache;
}

/**
 * Position size for a fixed fractional risk.
 * The single highest-value number on the platform: it is exact, it is not a
 * forecast, and getting it wrong is the most common way retail accounts die.
 */
export function positionSize(opts: {
  accountSize: number;
  riskPct: number;
  entry: number;
  stop: number;
  contractSize?: number;
}) {
  const { accountSize, riskPct, entry, stop, contractSize = 1 } = opts;
  const riskMoney = accountSize * (riskPct / 100);
  const perUnit = Math.abs(entry - stop) * contractSize;
  if (!(perUnit > 0) || !(riskMoney > 0)) return null;
  const units = riskMoney / perUnit;
  return {
    riskMoney: +riskMoney.toFixed(2),
    perUnitRisk: +perUnit.toFixed(5),
    units: +units.toFixed(4),
    // Loss after n consecutive losers, which is what actually ends accounts.
    drawdown5: +(accountSize * (1 - (1 - riskPct / 100) ** 5)).toFixed(2),
    drawdown10: +(accountSize * (1 - (1 - riskPct / 100) ** 10)).toFixed(2),
  };
}

/**
 * Risk of ruin / survival, by simulation. Given a per-trade expectancy and
 * win rate, how often does a trader blow up before the edge shows up?
 */
export function survival(opts: {
  hitRate: number; rr: number; riskPct: number; trades: number; ruinPct: number; sims?: number;
}) {
  const { hitRate, rr, riskPct, trades, ruinPct, sims = 4000 } = opts;
  // Mulberry32: the previous LCG had short-period low-bit correlation, which
  // badly understated ruin. Also report the MEDIAN, not the mean -- compounded
  // equity is heavily right-skewed, so a mean is dominated by a few lucky
  // paths and flatters dangerous position sizes.
  let a = 987654321 >>> 0;
  const rnd = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let ruined = 0;
  const finals: number[] = [];
  let worstDD = 0;
  for (let s = 0; s < sims; s++) {
    let eq = 1, peak = 1, dead = false;
    for (let t = 0; t < trades; t++) {
      eq *= 1 + (rnd() < hitRate ? rr : -1) * (riskPct / 100);
      peak = Math.max(peak, eq);
      worstDD = Math.max(worstDD, (peak - eq) / peak);
      if (eq <= 1 - ruinPct / 100) { dead = true; break; }
    }
    if (dead) ruined++;
    finals.push(eq);
  }
  finals.sort((x, y) => x - y);
  return {
    ruinProbability: +((ruined / sims) * 100).toFixed(1),
    medianEquity: +finals[Math.floor(sims / 2)].toFixed(3),
    worstDrawdown: +(worstDD * 100).toFixed(1),
  };
}
