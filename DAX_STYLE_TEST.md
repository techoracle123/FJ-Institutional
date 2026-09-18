# Testing the DAX (@thissdax) Style — Liquidity Sweep / Orderflow

**Result: does NOT pass. Not published. Here is the full evidence.**
Date 2026-09-18.

## Who and what

**DAX — @thissdax.** Nigerian trader, Lagos, ~203K followers, verified.
Bio: *"Founder || trader || Portfolio manager || Orderflow & TA"*. FundedNext
affiliate, publishes trades to Telegram with Myfxbook links.

Earlier I misread "DAX" as the German index and tested GER40. That was wrong.
This is the correct test: his actual **method**, not an instrument.

## What his method actually is

From his positioning (orderflow + TA, sessions, prop-firm risk) and the wider
orderflow/SMC literature, the trade is:

1. Price runs a **known liquidity pool** — previous day high/low, Asian-session
   range extreme, prior session high/low. That is where retail stops sit.
2. It **sweeps** the level, triggering those stops.
3. It **fails to hold** beyond it and closes back inside — the rejection.
4. Entry on that reversal, stop beyond the sweep wick, target the opposite pool.
5. Only during **London (07–11 UTC)** and **New York (12–16 UTC)** kill zones.

## What was tested

Three faithful implementations, on 15m and 1h bars, across 8 instruments
(XAUUSD, XAGUSD, NAS100, SP500, US30, EURUSD, GBPUSD, USDJPY), costs charged:

- **PDHL** — sweep of previous day high/low in a kill zone, then reclaim
- **ASIA** — sweep of the Asian-session range, then reclaim
- **WICK20 / WICK40** — sweep of the 20/40-bar extreme with same-bar rejection

Exits 1.0 ATR stop / 2.0 ATR target, matched to the verified breakout model.

## Stage 1 — per-symbol: looked promising

12 configurations beat the placebo on p-value:

| strategy | sym | tf | n | exp | CI-low | p |
|---|---|---|---|---|---|---|
| WICK40_LDN | GBPUSD | 15m | 72 | +0.2761R | **−0.065** | 0.003 |
| WICK40_NY | XAUUSD | 15m | 75 | +0.2270R | **−0.088** | 0.053 |
| WICK20_NY | XAUUSD | 15m | 111 | +0.2205R | **−0.049** | 0.040 |
| PDHL_BOTH | US30 | 1h | 251 | +0.1258R | **−0.044** | 0.013 |
| ASIA_NY | EURUSD | 1h | 304 | +0.0869R | **−0.051** | 0.007 |

**Every single CI-low is negative.** Sample sizes of 72–495 are too small:
at +0.22R with trade-level sd ≈1.3R you need n ≈ 550 for the CI floor to clear
zero. Yahoo caps 15m history at 60 days, so the sample cannot be grown that way.

## Stage 2 — the pooled test that killed it

Rather than accept underpowered per-symbol results, the identical rule was run
**pooled across all 8 instruments at once**. This is the harder and more honest
test: every instrument must be included, so cherry-picking is impossible.

| tf | lb | zone | n | exp | CI-low | t | placebo | p |
|---|---|---|---|---|---|---|---|---|
| 15m | 20 | LDN | 727 | **−0.1315R** | −0.233 | −2.57 | −0.095 | 0.742 |
| 15m | 20 | NY | 921 | −0.0786R | −0.163 | −1.76 | −0.108 | 0.192 |
| 15m | 40 | LDN | 516 | **−0.2202R** | −0.334 | −3.71 | −0.090 | 0.983 |
| 15m | 40 | BOTH | 1334 | −0.1402R | −0.214 | −3.79 | −0.100 | 0.867 |
| 1h | 20 | BOTH | 6318 | −0.0640R | −0.096 | −3.85 | −0.053 | 0.733 |
| 1h | 40 | BOTH | 4283 | −0.0725R | −0.112 | −3.60 | −0.053 | 0.842 |

**Negative in all 12 configurations. Zero survivors.**

## The conclusion

The per-symbol winners were **selection noise**. Twelve configurations across
eight instruments is 96 tests; at p<0.05 you expect ~5 false positives by chance
alone, and that is roughly what appeared. Pooling removes the choice and the
edge evaporates — it goes not just to zero but **firmly negative**, with
t-statistics of −2.5 to −3.9.

The pooled result is also **worse than its own placebo** on most cells. Random
entry beats sweep-reversal entry. Mechanically that makes sense: a level that
gets swept in a trending market usually keeps going, so systematically fading
breaks is fading trend.

## The honest caveat

This tests the **mechanical, rule-based** version of the method. DAX trades it
**discretionarily** — reading displacement, candle character, depth and context
in real time, and taking one or two setups a session rather than every signal.
That judgement layer is real and is not capturable in these rules, and he has a
verified payout record.

What this test establishes is narrower and still important: **the pattern alone,
traded mechanically, has no edge.** Any value in his approach lives in the
discretionary filtering, not in "sweep then reverse". We cannot publish a signal
built on it, because we cannot reproduce the part that does the work.

We do not ship a strategy because a good trader uses it. We ship it when it
passes the gate. This did not.
