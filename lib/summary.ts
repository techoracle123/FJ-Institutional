import type { MarketState } from './engines';
import type { Thesis } from './types';
import { bySymbol } from './types';
import { CALIB_N } from './thesis';

/**
 * Market summary generator.
 *
 * Deterministic prose composed strictly from structured facts already
 * computed by the engines — no language model, no invention. Every sentence
 * traces to a number in MarketState. If a fact is missing, the sentence is
 * omitted rather than hedged.
 *
 * The goal is that a trader who knows nothing about macro can read six lines
 * and understand what the market is doing and why.
 */

export interface Summary {
  headline: string;
  paragraphs: string[];
  bullets: { label: string; text: string; tone: 'pos' | 'neg' | 'neutral' | 'warn' }[];
  bottomLine: string;
}

const pct = (v: number, d = 2) => `${v >= 0 ? '+' : ''}${v.toFixed(d)}%`;

export function buildSummary(s: MarketState, theses: Thesis[]): Summary {
  const r = s.regime;
  const m = s.macro;

  // ---- Headline: the single most important fact right now ----
  const riskWord =
    r.risk === 'risk-on' ? 'Risk appetite is positive'
    : r.risk === 'risk-off' ? 'Risk appetite is deteriorating'
    : 'Risk appetite is mixed';

  const volWord =
    r.vol === 'compressed' ? 'volatility is unusually low'
    : r.vol === 'expanded' ? 'volatility is expanding'
    : r.vol === 'stressed' ? 'volatility is stressed'
    : 'volatility is around normal';

  const headline = `${riskWord} and ${volWord}.`;

  const paragraphs: string[] = [];

  // ---- What the regime means, in consequences not jargon ----
  const dollarPhrase =
    r.dollar === 'strongly-bullish' ? 'The dollar is strong and pressing on everything priced in it'
    : r.dollar === 'bullish' ? 'The dollar has a mild upward bias'
    : r.dollar === 'strongly-bearish' ? 'The dollar is weak, which supports metals and non-dollar currencies'
    : r.dollar === 'bearish' ? 'The dollar has a mild downward bias'
    : 'The dollar is directionless';

  paragraphs.push(
    `${dollarPhrase}. The single biggest influence on prices right now is ${r.dominantDriver.toLowerCase()}, ` +
    `which our model weights at ${r.dominantDriverStrength}% of the current signal. ` +
    `Confidence in this read is ${r.riskConfidence}%.`
  );

  // ---- Rates: explain the mechanism, not the number ----
  if (Number.isFinite(m.us2y) && Number.isFinite(m.real10y)) {
    const rateDir =
      m.us2yChg > 0.04 ? 'rising, which tightens financial conditions and typically supports the dollar while pressuring gold and growth stocks'
      : m.us2yChg < -0.04 ? 'falling, which loosens financial conditions and typically supports gold and growth stocks while weighing on the dollar'
      : 'broadly stable, so rates are not currently the swing factor';

    paragraphs.push(
      `Short-term US interest rate expectations sit at ${m.us2y.toFixed(2)}% and are ${rateDir}. ` +
      `The 10-year real yield — the return investors get after inflation, and the key opportunity cost of holding gold — is ${m.real10y.toFixed(2)}%.`
    );
  }

  // ---- Credit + volatility: the stress check ----
  if (Number.isFinite(m.hyOas) && Number.isFinite(m.vix)) {
    const credit =
      m.hyOas < 3.2 ? 'Credit markets are relaxed, which historically means dips get bought'
      : m.hyOas < 4.5 ? 'Credit markets are neutral'
      : 'Credit markets are showing stress, which historically precedes wider risk-asset weakness';

    paragraphs.push(
      `${credit} (high-yield spread ${m.hyOas.toFixed(2)}%). The VIX is ${m.vix.toFixed(1)}. ` +
      (m.vix < 15
        ? 'Low volatility favours trend continuation but leaves the market vulnerable to a sharp shock.'
        : m.vix > 25
        ? 'High volatility means wider stops and lower position sizes are appropriate.'
        : 'Volatility is in a workable range for normal position sizing.')
    );
  }

  // ---- Bullets: scannable specifics ----
  const bullets: Summary['bullets'] = [];

  const best = theses[0];
  if (best) {
    const inst = bySymbol(best.symbol);
    bullets.push({
      label: 'Strongest setup',
      text: `${best.direction === 'long' ? 'Long' : 'Short'} ${inst?.display ?? best.symbol} — conviction ${best.conviction}, ` +
        `${best.probability}% chance of reaching first target before stop, ${best.rr}:1 reward-to-risk.`,
      tone: best.direction === 'long' ? 'pos' : 'neg',
    });
  } else {
    bullets.push({
      label: 'No setups',
      text: 'Nothing clears our evidence and liquidity gates. Staying flat is the correct position.',
      tone: 'neutral',
    });
  }

  // Biggest mover
  const movers = Object.values(s.quotes);
  if (movers.length) {
    const top = [...movers].sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))[0];
    const inst = bySymbol(top.symbol);
    bullets.push({
      label: 'Biggest mover',
      text: `${inst?.display ?? top.symbol} at ${pct(top.changePct)} on the day.`,
      tone: top.changePct >= 0 ? 'pos' : 'neg',
    });
  }

  if (s.anomalies.length) {
    const a = s.anomalies[0];
    bullets.push({
      label: 'Watch out',
      text: `${a.title}. ${a.interpretation}`,
      tone: 'warn',
    });
  }

  if (s.dataConfidence < 100) {
    bullets.push({
      label: 'Data quality',
      text: `Feed confidence is ${s.dataConfidence}%. ${s.dataConfidence < 85 ? 'Below our 85% gate — theses are suspended.' : 'Sufficient to publish theses.'}`,
      tone: s.dataConfidence < 85 ? 'warn' : 'neutral',
    });
  }

  // ---- Bottom line: what to actually do ----
  const longs = theses.filter(t => t.direction === 'long').length;
  const shorts = theses.filter(t => t.direction === 'short').length;

  let bottomLine: string;
  if (!theses.length) {
    bottomLine =
      'There is no edge on the board right now. The evidence across our twelve causal layers is either conflicting or too thin to act on. ' +
      'Doing nothing is a decision, and today it is the right one.';
  } else {
    const lean = shorts > longs ? 'defensive' : longs > shorts ? 'constructive' : 'two-sided';
    bottomLine =
      `The board leans ${lean}: ${longs} long ${longs === 1 ? 'idea' : 'ideas'} and ${shorts} short. ` +
      `Our probabilities are corrected against ${CALIB_N.toLocaleString()} historical trades, so a ${theses[0].probability}% reading means ` +
      `roughly ${theses[0].probability} out of 100 similar setups reached target before stop. ` +
      `That is below a coin flip by design — the edge comes from ${theses[0].rr}:1 payoff, not from being right often.`;
  }

  return { headline, paragraphs, bullets, bottomLine };
}
