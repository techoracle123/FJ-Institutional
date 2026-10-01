# Can we get more trades? — Higher-Frequency Hunt

**Answer: no. Frequency destroys the edge. Evidence below.**
Date 2026-10-01.

## The question

The verified breakout fires ~2.88 times/day pooled across NAS100 + S&P 500.
Could we get scalp-level frequency — 10, 20 trades a day?

## The scan

Donchian breakout, lookbacks 48/96/192/384, on **5m and 15m** bars, both
instruments, holds of 16–48 bars, full costs charged, placebo gate on.
32 configurations.

## Result: a clean monotonic relationship

| sym | tf | lookback | trades/day | expectancy |
|---|---|---|---|---|
| NAS100 | 5m | 48 | **21.84** | **−0.1319R** |
| NAS100 | 5m | 96 | 14.98 | −0.1025R |
| NAS100 | 5m | 384 | 7.36 | −0.1591R |
| NAS100 | 15m | 48 | 7.08 | −0.1564R |
| NAS100 | 15m | 384 | 2.38 | −0.1548R |
| **NAS100** | **1h** | **96** | **~1.4** | **+0.1703R** |

**Every single high-frequency configuration is negative.** Not marginal —
t-statistics of −1.0 to −4.5. The more often it trades, the more it loses.

## Why — the cost arithmetic

Spread is fixed; ATR shrinks as you drop timeframe. So cost as a share of
every 1R of risk explodes:

| sym | tf | median ATR | cost as % of 1R |
|---|---|---|---|
| SP500 | 5m | 3.52 | **14.2%** |
| SP500 | 15m | 7.59 | 6.6% |
| NAS100 | 5m | 26.89 | 5.6% |
| NAS100 | 1h | 39.85 | **3.8%** |

On SP500 5m you surrender **14% of your risk budget to the spread on every
trade** before the market moves. Twenty trades a day of that is a guaranteed
bleed. This is the arithmetic that kills nearly all retail scalping.

## The one apparent survivor — and why it was fake

SP500, 15m, lookback 384, n=96: +0.2879R, p=0.0033, CI-low +0.008.

Two reasons it was rejected:

1. **It is not a new strategy.** 384 bars × 15m = 96 hours — the *same channel*
   as the verified model, just detected on finer bars.
2. **It dies out-of-sample.** Tested properly, pooled, with an IS/OOS split:

   | detection | n | exp | p | IS | **OOS** |
   |---|---|---|---|---|---|
   | 1h bars (shipped) | 1648 | +0.1250R | 0.000 | +0.1518R | **+0.0800R** |
   | 15m bars | 209 | +0.0577R | 0.040 | +0.2490R | **−0.4067R** |

   In-sample +0.249R, out-of-sample **−0.407R**. Textbook overfit. One lucky
   cell out of 32 — at p<0.05 you expect ~1.6 false positives by chance, and
   that is exactly what showed up.

## Conclusion

The edge lives in the **96-hour channel**, which is a slow, structural level.
Trying to express it faster adds cost and noise and nothing else. The honest
frequency ceiling for this model is **~2.9 trades/day across both instruments**,
and that is what ships.

If you want more trades, the route is **more instruments that pass the gate**,
not faster trading on the same ones.
