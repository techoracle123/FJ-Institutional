# FJ Institutional

**Live: https://fjinstitutional.techoracle0.workers.dev**

A market intelligence operating system. It reads the global market across twelve
causal layers and resolves it into a small number of evidence-backed, falsifiable
trade theses — entry, exit, why, and a calibrated probability.

You do not execute here. You decide here.

## What makes it different

- **Silence is a valid output.** If evidence conflicts, liquidity is thin, or data
  confidence drops below 85%, no thesis is issued. The platform says so plainly.
- **Two numbers, never one.** A conviction grade (A+/A/B/C) for ranking, and a
  calibrated probability for the falsifiable claim. Never a bare "score".
- **Honest calibration.** The raw model was overconfident (claimed ~72%, realised
  ~41%). We fit an isotonic correction from 1,192 historical trades and apply it
  live. Brier score 0.307 → 0.241. The correction is published, not hidden.
- **Costs always modelled.** Spread is charged on every backtested trade and in
  every expected-value figure.
- **No lookahead.** Walk-forward only; entries at next bar's open; when a bar spans
  both stop and target, the stop is assumed hit first.

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind v4 ·
Supabase (auth + Postgres) · TradingView Advanced Charts · Recharts-free custom SVG.

Runs entirely on free tiers.

## Data

| Source | Use | Cost |
|---|---|---|
| FRED | 22 macro series, release calendar | Free |
| Twelve Data | Primary quotes | Free tier |
| Yahoo Finance | Fallback quotes + 5y daily history | Free |
| CFTC Socrata | Weekly COT positioning | Free |
| TradingView | Charts | Free widget |

## Setup

```bash
npm install
cp .env.example .env.local   # fill in keys
npm run dev
```

No database migration is required. Accounts are created server-side (instant,
no confirmation email) and journal entries persist in Supabase user metadata.

`supabase/schema.sql` is optional — apply it only if you later want journal
entries in dedicated Postgres tables with row-level security.

## Deploy

```bash
npx opennextjs-cloudflare build
npx wrangler deploy
```

Requires Node 22+. Server secrets are set with `wrangler secret put`.

## Routes

`/` Now · `/opportunities` · `/markets` · `/markets/[symbol]` · `/calendar` ·
`/record` Track Record · `/journal` · `/account`

## Disclaimer

General market analysis, not personalised investment advice. Backtested results are
hypothetical. Trading carries substantial risk of loss.
