# Add NQ Futures Plans

Same plan concept (pivot, targets, bias, naked POCs, 08:30 ET anchor), just parameterized by symbol so `/ES` and `/NQ` run side by side.

## What already works out of the box
- `fetchSchwabPriceHistory` / `getSchwabHistory` / `getSchwabSpxGex`-style functions accept any symbol — passing `/NQ` returns bars.
- `generatePlanFromBars` is symbol-agnostic (RTH windows and TPO math are identical for NQ). Tick size is also 0.25 for NQ, so no math change required.
- `daily_plans` table already keys on `(user_id, plan_date, symbol)` — storing an NQ row next to ES just works.

## What needs to change

### 1. Symbol registry (new, tiny)
`src/lib/symbols.ts` — one place that lists supported futures and their metadata:
- `id` (`ES` / `NQ`), Schwab root (`/ES` / `/NQ`), display label, tick size, min-gap for targets (ES uses 8 pts today; NQ needs a wider default, ~25 pts, since NQ moves ~4–5× ES).
- Export `SUPPORTED_SYMBOLS` and a `getSymbol(id)` helper.

### 2. Plan generator parameterization
`src/lib/plan-generator.ts`:
- Accept `{ tickSize, minGap }` options (default to current ES values so nothing else breaks).
- Replace the hard-coded `TICK = 0.25` and `MIN_GAP = 8` with the passed-in values.
- No other logic changes.

### 3. Server functions accept a symbol
`src/lib/plans.functions.ts`:
- `generateDailyPlan` already takes `symbol`; extend it to look up the symbol config, pass `/NQ` (or `/ES`) to Schwab, and forward `tickSize` / `minGap` to `generatePlanFromBars`. Store row with `symbol: "NQ"` / `"ES"`.
- `getLatestPlan` / `listPlans` / `computePlanResultsFn` — already parameterized by symbol; just ensure the UI passes it through and `computePlanResultsFn` maps `NQ → /NQ` for the history fetch (mirroring the existing ES branch).

### 4. UI: symbol switcher on the Plan page
`src/routes/index.tsx`:
- Add a small segmented control (ES | NQ) above the plan card. Persist selection in `localStorage`.
- Re-fetch latest plan on switch; "Regenerate Plan" posts with the selected symbol.
- Copy-to-Discord text prefixes with the selected symbol.

### 5. Chart panel generalization
`src/components/charts/EsChartPanel.tsx` + `useEsFeed`:
- Currently hard-coded to `/ES`. Accept a `symbol` prop, thread it into `useEsFeed(timeframe, symbol)`, and update the "LIVE · SCHWAB" pill label.
- TPO profile derives from the same live 1m bars, so it follows automatically.

### 6. Downstream pages (out of scope for this step, flagged)
Journal / Performance / Analysis / Balance Zones currently render per-plan; once they're wired to live data (previously scoped work), they'll each need the same symbol switcher. Iron Fly stays SPX-only. This plan only wires the Plan page + chart end-to-end for NQ; the other pages continue to show ES until their live-data pass.

## Technical notes
- NQ RTH session is identical to ES (09:30–16:00 ET), so no schedule changes.
- Schwab historical futures endpoint returns `/NQ` bars the same way as `/ES` — no new entitlement expected, but we'll surface the same "no_bars" toast if the account isn't entitled.
- Default `MIN_GAP` values: ES = 8 pts, NQ = 25 pts (roughly proportional to ATR). Easy to tune later per feedback.
- The 08:30 ET anchor logic in `plans.functions.ts` is symbol-agnostic and needs no change.

## Files touched
- new: `src/lib/symbols.ts`
- edit: `src/lib/plan-generator.ts` (accept tickSize/minGap)
- edit: `src/lib/plans.functions.ts` (map symbol → Schwab root, pass options)
- edit: `src/routes/index.tsx` (ES/NQ switcher, persist selection)
- edit: `src/components/charts/EsChartPanel.tsx` + `src/lib/use-es-feed.ts` (symbol prop)

No DB migration, no new secrets.
