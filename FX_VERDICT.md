# Why We Can't Find An FX Edge — And Who Actually Profits

**You asked: "People profit from forex, how come we can't?"**
Here is the honest, evidenced answer. Date 2026-10-02.

## Part 1 — The premise needs checking first

"People profit from forex" is mostly **survivorship bias**. You see the winners
because the losers go quiet. The actual numbers are legally mandated — since
2018 every EU/UK broker must publish what share of its retail accounts lose
money, audited and recalculated quarterly:

| Source | Finding |
|---|---|
| **ESMA** (mandated disclosure) | **74–89%** of retail CFD/forex accounts lose money |
| 49 regulated brokers, 2026 avg | **71.0%** lose (range 51–81%) |
| **US CFTC** | 70–80% of retail forex accounts unprofitable |
| **Barber & Odean** — Taiwan, 450k accounts, 1992–2006 | **<1%** predictably profitable after costs |
| **Chague & De-Losso** — Brazil, traders persisting 300+ days | **97% lost money**; only 1.1% beat minimum wage |

Note the Brazil result carefully: those were **committed** traders who stuck it
out past 300 sessions. Persistence did not fix it — the longer they traded, the
more they lost.

So roughly **1–3% are durably profitable**. They are real. But "people profit
from forex" describes the same share of people who profit from poker.

## Part 2 — What we tested, and it is not a small list

Across this engagement, on FX majors + GBPJPY and the crosses you named, with
real spreads charged and the direction-matched placebo gate applied:

| Family | Configurations | Result |
|---|---|---|
| Trend + momentum (daily, 10y) | all majors | **−260.8R**, profitable 1 year in 11 |
| Donchian breakout (1h) | 5 majors × 3 lookbacks | all negative OOS |
| Mean reversion / VWAP (1.8σ, 2.3σ) | majors | negative |
| Liquidity sweep / orderflow (the DAX method) | 12 configs × 8 instruments | pooled **negative in all 12** |
| Macro composite (point-in-time FRED) | majors | p = 0.30–0.46 |
| COT positioning (12y) | majors | weak, momentum-signed |
| **Pairs / statistical arbitrage** | 12 cointegrated pairs | **all 12 negative** |
| **Hour-of-day bias** | 24h × 2 directions × 8 pairs | 0 pass |
| **Month-end rebalancing flow** | 8 pairs, both directions | 0 pass |
| **Asian-range breakout** | 8 pairs | 0 pass |

The last four blocks alone were **216 configurations: zero passed.**
Total across the engagement: **~300 mechanical FX configurations, zero survive.**

## Part 3 — The two results that explain everything

**1. Pairs trading looked spectacular until the maths was fixed.**
First pass showed t = 10–17 and 70% win rates on all 12 pairs. That was a bug:
I measured P&L in *z-score units*, and a z-score mean-reverts by construction —
"enter at |z|=2, exit at |z|=0.5" books +1.5σ almost every time. Recomputed with
**actual leg returns and both spreads charged**, every pair went negative.

| pair | n | expectancy | win rate |
|---|---|---|---|
| EURUSD/GBPUSD | 348 | −0.107R | 59.2% |
| AUDUSD/NZDUSD | 332 | −0.224R | 57.5% |
| AUDUSD/USDCAD | 340 | −0.006R | **61.8%** |

Look at those **win rates: 54–62%, and still losing money.** This is the exact
trap that kills retail mean-reversion traders. You win 6 times out of 10 and the
4 losses are bigger than the 6 wins. It *feels* like an edge every single week.

**2. Cost arithmetic is the whole story.** FX majors move ~0.5%/day. The spread
is fixed. On the 5m tests the spread was **14.2% of every 1R risked** before the
market moved at all. FX is a **$7.5 trillion/day** market — the most efficient
market that exists. There is no simple pattern left in it that survives cost.

## Part 4 — So who are the 1–3%?

They are not running a mechanical rule on EURUSD. They are:

- **Market makers** — earning the spread you pay, not predicting direction.
- **Carry at institutional scale** — holding rate differentials with funding
  costs retail does not get, over months.
- **Discretionary traders** with real judgement — reading context, taking one or
  two setups a week, sizing properly. Like **@thissdax**: real, verified payouts,
  and when I tested his *pattern* mechanically it had no edge. **The edge is his
  judgement, not the pattern** — which is precisely why it cannot be sold as a
  signal.
- **Risk managers first.** The research is unanimous that the separator is
  position sizing and loss discipline, not entry selection.

## Part 5 — The uncomfortable conclusion

**We cannot ship an FX signal because there is no mechanical FX edge to ship at
retail cost structures.** Three hundred tests say so, and the regulatory data
says the people "profiting" are mostly a statistical illusion.

What we *did* find passes the same brutal gate that killed all the FX work:

> **NAS100 + S&P 500, 96-hour channel breakout**
> +0.125R/trade · 95% CI [+0.056, +0.194] · p < 0.001 · placebo −0.036R
> 1,648 trades · positive in-sample AND out-of-sample

Indices work where FX does not, for a structural reason: **equity indices have a
genuine upward drift and real trend persistence driven by flows and dealer
hedging. FX majors are a zero-sum relative price between two central banks.**
There is no drift to harvest and no structural buyer.

This is the honest answer: **trade where the edge is, not where the marketing
is.** FX has the most marketing and the least edge. That is not a coincidence —
it is the business model, because 71–89% of those accounts lose and the broker
is usually the counterparty.

## What I would do next, if you want FX specifically

1. **Gold (XAUUSD)** — already shows OOS +0.255R on the 96h breakout but
   in-sample negative, so it is unstable. More history would settle it.
2. **Carry, properly** — long high-yielder vs low-yielder held for weeks, with
   real swap costs. The one FX factor with decades of academic support. It is a
   *position* strategy, not day trading.
3. **Accept FX as context only** — which is what the platform already does.
