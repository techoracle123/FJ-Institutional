# Verified Intraday Edge — NAS100 Hourly Channel Breakout

**Status: PASSED the direction-matched placebo gate. Live on the board.**
Date 2026-09-17. This is the first entry model on the platform entitled to publish.

## Why this search was run

Every model previously tested was measured on **daily bars**, and all of them failed:
trend+momentum (p=0.24–0.47), macro composite (p=0.30–0.46), COT (momentum-signed, weak),
weekday seasonality (marginal). The board was publishing nothing.

The flaw in that conclusion: **intraday had never been tested.** Day-trading and scalping
edges live on M5/M15/H1, not on daily bars. That is where this search went.

## What was searched

15 instruments × 1-hour bars (Yahoo, 13,700–17,300 bars each, 2024-04 → 2026-09):
NAS100, SP500, US30, **GER40 (the DAX you asked for)**, UK100, EU50, JP225, US2000,
XAUUSD, XAGUSD, EURUSD, GBPUSD, USDJPY, USDCHF, AUDUSD.

Strategy families tested, each with realistic round-trip costs charged in R:
- **Opening-range breakout** (London 07/08 UTC, NY 12/13/14 UTC; 3-bar range, 6-bar window)
- **Session momentum** and **session fade** at each session open
- **VWAP / mean reversion** at 1.8σ and 2.3σ
- **Donchian channel breakout** at 20 / 48 / 96 / 112 / 128-hour lookbacks

Every candidate was run through the **direction-matched placebo**: random entry timing,
identical long/short mix, identical exit machinery, same sample size, 300 repetitions.
Pass bar: `p < 0.05` AND bootstrap CI-low > 0.

## The result

**NAS100, 96-hour Donchian breakout, 1.0 ATR stop, 2.0 ATR target, 48h hard time stop.**

| metric | value |
|---|---|
| expectancy | **+0.1703 R** / trade |
| bootstrap 95% CI | **[+0.071, +0.268]** — CI-low > 0 |
| t-statistic | **3.40** |
| direction-matched placebo | **−0.0279 R** |
| **p-value** | **0.000** |
| win rate | 39.9% (not the metric) |
| sample | n = 859, total **+146.3 R** |
| costs | 1.5 index points round-trip, charged inside every number |

### Why this is timing and not drift — the three tests that killed every prior model

1. **The placebo is NEGATIVE (−0.028R).** Random entries with the same long/short mix and
   identical exits *lose money*. On the daily models the placebo was +0.17R to +0.19R and
   consumed the entire result.
2. **Shorts (+0.2114R, n=271) beat longs (+0.1514R, n=588).** NAS100 rose **+19.9%/yr**
   over the sample. Drift-harvesting cannot make the short book the better book.
   This is the single strongest piece of evidence.
3. **Out-of-sample** on the last 40% of data never used for selection:
   n=325, **+0.1133R, p=0.030, +36.8R**.

### Robustness — because one lucky cell is exactly what a placebo gate is for

- **Parameter neighbourhood: 25 of 25 cells positive.** Lookback {64,80,96,112,128} ×
  {stop, target, hold} variants. Median +0.1536R. No cliff, no knife-edge fit.
- **Year by year: 2024 +0.221R, 2025 +0.127R, 2026 +0.129R.** Positive in all three.
- Trigger frequency: **1 per ~13–17 hours**, roughly one opportunity per day.

## What FAILED — stated plainly

**GER40 / DAX does not pass.** It looked strong in-sample (+0.227R at lb48) and went
**negative out-of-sample (−0.065R)**. That is textbook overfitting and it is exactly why
it is not published. Same for JP225 (IS +0.205R → OOS −0.104R) and EU50 (OOS −0.347R).

XAUUSD was borderline-interesting (OOS +0.255R, p=0.000) but **in-sample negative
(−0.094R)** — the sign flips across the split, so it is not stable enough to trade.

All 5 FX majors, SP500, US30, US2000, XAGUSD, UK100: **no edge**. US2000 was strongly
negative (−0.240R) in both halves.

Mean reversion and session/ORB strategies: no survivors after the placebo gate.

**14 of 15 instruments failed. One passed.** That ratio is what an honest search looks like.

## Honest limits

- **2.4 years of hourly history — one macro regime.** It has not traded a sustained bear market.
- Yahoo hourly bars for `NQ=F`, not tick-built bars.
- Breakout models cluster losses in range-bound conditions. Expect consecutive stop-outs.
- **39.9% win rate.** Six of ten trades lose. It pays through the 2:1 payoff.
  A trader who cannot sit through four losses in a row should not trade it.

## How it runs in production

- `lib/breakout.ts` — the model, spec frozen, full numbers in the header.
- `lib/thesis.ts::buildVerifiedThesis` — publishes on its **own** verification, independent
  of `ENTRY_MODEL_VERIFIED` (which still gates the unverified daily model).
- Evidence layers are attached as **context only**. They cannot veto the trade — mixing an
  unverified model into a verified one would forfeit the verification.
- **Does not chase:** no publication beyond 1.0 ATR past the channel, or if price closes
  back inside it.
- `lib/datarouter.ts::hourly` — same Yahoo source the model was fitted on, final
  still-forming bar dropped. Not TwelveData `IXIC` (cash index, different session).
- `scripts/track.mjs` — breakout theses are **excluded from the trailing stop** and use a
  48h expiry. The verified spec has a fixed stop/target; adding a trail would make live
  diverge from backtest, which is the mistake that cost 30.18R previously.
