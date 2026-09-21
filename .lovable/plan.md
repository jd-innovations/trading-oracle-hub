# Auto-Trader Performance: report now, real data next

## What the numbers say (Jul 23 – Sep 16, 2026)

Pulled directly from the saved auto-trader sessions (44 completed trades across ES and NQ).

| | Trades | Wins | Losses | Win rate | Net points | Avg / trade | Best | Worst |
|---|---|---|---|---|---|---|---|---|
| ES | 23 | 5 | 18 | 21.7% | -589.50 | -25.63 | +94.00 | -117.00 |
| NQ | 21 | 6 | 15 | 28.6% | -3,391.50 | -161.50 | +495.00 | -452.25 |
| Total | 44 | 11 | 33 | 25.0% | -3,981.00 | -90.48 | +495.00 | -452.25 |

Pattern: the strategy is stopping out roughly three times for every win. NQ wins are large (+450, +495) but the stop losses are consistently around -250 to -450, so the losers outweigh them. ES losses are small and steady (-24 to -48) but the wins are too small to offset them.

Recent stretch (Sept): 9 trades, 1 win. The last win was NQ on Sep 4.

## Two problems found

**1. The Journal is empty.** All 44 trades live only inside the daily auto-trader session records; not one made it into the Journal table. The save step relies on a duplicate-protection rule on the Journal table that was never created, so every save has been failing silently since the server-side auto-trader went live.

**2. The Performance page is still showing sample numbers**, not the real results above.

## Plan

1. Add the missing duplicate-protection rule to the Journal table.
2. Backfill all 44 historical trades from the saved session records into the Journal, so the Journal and the report cover the full history from July 23 onward.
3. Rebuild the Performance page on real data: win rate, net points, net dollars (ES x50, NQ x20), average win vs average loss, profit factor, max drawdown, per-symbol split, rolling windows (L5 / L10 / L20 / All), and an equity curve from actual closed trades.
4. Add a "Copy report" button that produces a Discord-ready performance block in the existing house format.

## Technical notes

- Add `unique (user_id, symbol, plan_date, entry_time)` on `journal_entries` — this is the `onConflict` target `src/routes/api/public/auto-trader/tick.ts` already passes, which is why the upsert currently errors and only logs a warning.
- Backfill in the same migration: expand `auto_trader_state.state->'completedLegs'` and insert into `journal_entries` (fields: side, entry/exit price + label, entry/exit time, phase, realized, contracts 3).
- Tighten the tick handler: treat a journal upsert error as a failure for that leg rather than incrementing `logged_leg_count`, so a future breakage is visible instead of silent.
- Replace `perfWindows` / `equityCurve` mock imports in `src/routes/performance.tsx` with an authenticated server fn (`requireSupabaseAuth`) over `journal_entries`, consumed via `useQuery`.
- `realized` is stored as total points for the position (3 contracts), not per-contract — the report labels it as such and derives dollars with `pointValueFor`.
