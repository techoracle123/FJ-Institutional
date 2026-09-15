# Edge Research — why the platform is losing, and what actually works

Ten years of daily bars (2016–2026), 10 instruments, 3,776 baseline trades.
Walk-forward by calendar year. No parameter was chosen without a sensitivity sweep.

## 1. The platform is currently negative

Live `/api/backtest` after the 10-pair expansion:

```
n=1859   hit 38.4%   totalR −39.29
```

It was **+65.4R at 6 instruments**. The four pairs I added did this:

| symbol | n | hit% | PF | totalR | avgR |
|---|---|---|---|---|---|
| AUDUSD | 165 | 29.7 | 0.58 | **−47.5** | −0.288 |
| NZDUSD | 180 | 33.3 | 0.69 | **−36.6** | −0.203 |
| USDCAD | 166 | 34.9 | 0.84 | −16.2 | −0.098 |
| USDCHF | 171 | 38.0 | 0.94 | −6.3 | −0.037 |
| EURUSD | 171 | 39.2 | 0.90 | −9.4 | −0.055 |
| GBPUSD | 167 | 39.5 | 0.91 | −9.3 | −0.056 |
| NAS100 | 198 | 38.9 | 0.99 | −0.6 | −0.003 |
| USDJPY | 181 | 39.2 | 1.03 | +3.3 | +0.018 |
| XAGUSD | 234 | 42.7 | 1.25 | +34.4 | +0.147 |
| XAUUSD | 226 | 44.7 | 1.39 | **+48.9** | +0.217 |

**original 6: +67.4R · new 4: −106.7R**

The capacity analysis asked "can we serve 10 pairs?" — it never asked
"do we have edge on them?". That was my error.

## 2. The real finding: the signal has opposite sign by asset class

Same signal, split by asset class, 10 years:

| model | FX (7 pairs) | Metals/Index (3) |
|---|---|---|
| trend only | −237.0R | +55.2R |
| momentum only | −188.8R | +79.1R |
| **trend+momentum** | **−260.8R** | **+95.9R** |
| fade trend+momentum | +42.6R | −96.8R |

Trend-following FX majors on daily bars is a **negative-edge strategy**, and
we were shipping it. Year by year, FX trend-following is positive in
**1 of 11 years**. Metals/indices: 6 of 11. This is structural — majors are
mean-reverting intraday-to-daily because central banks and carry flows
dampen directional persistence; gold and equity indices trend because they
absorb persistent macro repricing.

## 3. Biggest single improvement: stop using fixed targets

Metals/indices, varying only the exit:

| exit | n | hit% | PF | totalR | avgR |
|---|---|---|---|---|---|
| fixed 1.9R (current) | 1343 | 40.2 | 1.12 | +95.9 | +0.071 |
| fixed 3.0R | 1103 | 36.0 | 1.20 | +139.4 | +0.126 |
| maxHold 20 + 3R | 923 | 34.1 | 1.29 | +180.6 | +0.196 |
| **trail 2.5×ATR, hold 20** | **774** | **33.6** | **1.45** | **+224.8** | **+0.290** |
| breakeven stop at 1R | 1573 | 24.5 | 0.83 | **−134.1** | −0.085 |
| partial TP at 1R + BE | 1573 | 52.4 | 0.92 | −63.0 | −0.040 |

**+95.9R → +224.8R (2.3×) purely from letting winners run.** Hit rate *falls*
from 40% to 34% while profit more than doubles — more proof that win rate is
the wrong objective.

Two folklore killers, both measured:
- **Breakeven stops destroy the edge** (−134R). They convert would-be big
  winners into scratches while leaving every loser full-size.
- **Partial profit-taking pushes hit rate to 52.4% and still loses money.**
  It sells exactly the trades that pay for everything else.

Robustness — the trail is not a cherry-pick:

```
2.00 ATR +249.9R    2.50 ATR +224.8R    3.00 ATR +224.9R
2.25 ATR +247.8R    2.75 ATR +221.8R    3.50 ATR +226.5R
```

Every value in the range works. Per symbol: XAUUSD +104.5R (PF 1.64),
XAGUSD +82.4R (PF 1.46), NAS100 +37.9R (PF 1.25). Positive in **8/11 years**.

## 4. What I am NOT shipping, and why

"Fade the trend in low volatility" looked strong on FX: +107.4R, and it was
positive on all 7 pairs. I killed it anyway.

```
full sample      n=855  avgR +0.126  t=2.10
excluding 2026   n=799  avgR +0.080  t=1.30   <-- not significant
```

2026 alone is 41% of the profit. A result that collapses to t=1.30 when you
remove one year is a story, not an edge. It goes in the research log, not the
product.

## 5. The alert gap

`scripts/track.mjs` contains **zero** Telegram code. Alerts only ever fired
from `alerts.yml` on 3 fixed daily crons (07:07, 13:07, 21:07 UTC). Theses are
published by the 5-minute tracker at arbitrary times, so any thesis born
outside those three windows was silently added to the ledger and never
announced.

Measured against the live ledger: **6 of 9 theses were never alerted (67%).**

```
07:16 NAS100 short  alerted
08:14 USDCAD short  NEVER
09:00 USDJPY short  NEVER
10:47 XAUUSD short  NEVER
13:04 XAUUSD short  alerted
14:52 USDCAD short  NEVER
07:09 XAUUSD short  alerted
09:32 USDCAD short  NEVER
12:21 USDJPY short  NEVER
```

Alerting must be **event-driven from the tracker** at publish time, plus
exit/stop/target notifications, which never existed at all.

## 6. Why signals feel rare

Gate 0.42 on daily bars with `no overlapping positions` yields ~1 trade per
instrument per 6–7 days. Removing the negative-edge FX pairs reduces raw
count further — but count was never the goal. The fix for "rare" is not a
looser gate (every gate loosening tested below 0.42 lost money); it is
**covering the instruments where edge exists** and **holding winners longer**,
which raises R per signal rather than manufacturing noise.

## Recommendation

1. Demote the 4 new FX pairs and the FX majors from signal generation.
   Keep them as *context* (correlation, dollar regime) — not as theses.
2. Switch metals/indices to trailing-ATR exits, `maxHold` 20.
3. Make alerts event-driven, including exits.

---

# Addendum — the placebo gate (15 Sep 2026)

## The test that invalidated the model

Direction-matched placebo: replace the entry rule with **random timing**, keep
the exit machinery and the **long/short mix** identical.

Matching direction is essential. Over the sample these instruments drifted:

```
XAUUSD +12.8%/yr    XAGUSD +13.1%/yr    NAS100 +19.9%/yr
```

A random **long** book returns **+0.214R** on gold with the trailing exit
attached. An unmatched control would have credited that beta to the signal.

Result:

| instrument | expectancy | CI-low | CI-high | placebo | p |
|---|---|---|---|---|---|
| XAUUSD | +0.216R | +0.098R | +0.337R | +0.168R | 0.240 |
| XAGUSD | +0.216R | +0.100R | +0.335R | +0.187R | 0.365 |
| NAS100 | +0.001R | −0.095R | +0.097R | −0.014R | 0.420 |

**Nothing passes.** Bootstrap floors are positive on gold and silver, so the
results are separable from zero — but not from random entry timing. The
trailing stop was harvesting drift; the signal contributed nothing measurable.

## The macro replacement was built and also failed

Point-in-time macro entry, strictly lagged (last FRED observation *before* the
bar), composite of four economically-signed components:

- `−Δ2y (20d)` — tighter front-end policy is bearish duration-sensitive assets
- `+Δ2s10s (20d)` — steepening implies growth/reflation
- `−Δ10y real (20d)` — higher real yields raise the opportunity cost of gold
- `+VIX level` — elevated risk premium predicts positive forward returns

Signs were set by economics first, then confirmed by Spearman IC (|t|>2.5):

```
curve_20 -> XAUUSD fwd10  +0.088      d2y_20  -> NAS100 fwd10  -0.098
curve_20 -> XAGUSD fwd10  +0.091      vix_lvl -> NAS100 fwd10  +0.113
real10_5 -> NAS100 fwd5   -0.074      hy_5    -> EURUSD fwd5   +0.115
```

Quintile sort on the composite was near-monotone, with Q1 worst on all three
instruments. Expectancy improved:

| variant | XAUUSD | XAGUSD | NAS100 |
|---|---|---|---|
| price only | +0.134R | +0.162R | +0.031R |
| macro only | +0.123R | +0.169R | +0.021R |
| **macro AND price** | **+0.152R** | **+0.195R** | **+0.040R** |

But against the direction-matched placebo: **p=0.297, p=0.463, p=0.365.**
Better expectancy, still no demonstrable timing skill.

## What shipped

- `verifyStrategy` / `scripts/verify.mjs` — bootstrap CI (10k) + placebo (400).
- `data/verification.json`, refreshed nightly by `.github/workflows/verify.yml`.
- `ENTRY_MODEL_VERIFIED = false` → **thesis publication is gated off entirely.**
- `VerificationNotice` explains the suspension in plain language.
- `/record` publishes CI-low, placebo p-value and VERIFIED/NOT VERIFIED per row.

### Performance note

Running verification per-request was ~11M operations, exceeded the Worker's
10ms CPU budget, and caused intermittent **site-wide 503s** (`/markets`,
`/live`, `/calendar`). It is now precomputed in Actions. Post-fix: 6 rapid
`/api/backtest` calls all 200, and 9 routes with 0 console errors.

## What would actually pass this gate

Not another price-derived indicator — those are what just failed. Candidates
with genuine information content:

1. **Event-conditioned entries.** Trade only the 24h after a macro surprise
   (CPI/NFP/FOMC vs consensus). The calendar is already ingested.
2. **COT positioning extremes.** Commercial hedger positioning at multi-year
   percentiles is a documented contrarian signal and is already ingested.
3. **Cross-asset divergence.** Gold vs 10y real yield residual — when the
   measured relationship breaks, the gap tends to close. FJ already measures
   these correlations.
4. **R:R geometry search.** Never tested beyond ~2.9:1; the best cells on the
   comparison platform are all 1:4.
