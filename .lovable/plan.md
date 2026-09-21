# Track peak profit (and worst drawdown) per trade

Right now a trade only records where it entered and where it exited. That hides the most important detail about the 32 losers that never scaled: did price move meaningfully in your favor first, or did it go against you straight away?

This adds two new numbers to every trade:

- **Peak profit** — the best the trade ever looked, in points, before it closed.
- **Worst drawdown** — the furthest it went against you before it closed.

Both are measured per contract from the entry price, using the same one-minute bars the auto-trader already reads.

## What changes

1. **Trade engine** — while a trade is open, each new bar updates the running best and worst excursion from entry. When the trade closes, both are stored with the completed trade, along with the time the peak occurred.
2. **Database** — two new columns on trade records for peak profit and worst drawdown, plus the time of the peak.
3. **Live saving** — the minute-by-minute runner writes these values with each completed trade.
4. **Journal** — each trade row/card shows "peak +X / worst -Y" next to the result.
5. **Performance page** — a new block answering the question directly: for losing trades, how many were ever green, the average peak profit of a loser, and how many reached at least half the distance to the first target before reversing.

## Note on history

The 44 trades already recorded can't get accurate peak values retroactively — that requires replaying each day's minute bars, which are no longer retrievable for the older sessions. Those trades will show peak/worst as blank, and the new stats will label how many trades they cover. Everything from the next session forward is tracked fully.

## Technical notes

- `TradeState` gains `mfe`, `mae`, `mfeTime` fields, reset on each leg start (including neutral re-arms); updated in `advance()` from `bar.high`/`bar.low` before the stop check, so a bar that both runs up and stops out still records the run-up.
- `CompletedLeg` gains `mfe`, `mae`, `mfeTime`; `closeLeg()` carries them through.
- Migration: `alter table public.journal_entries add column mfe_points numeric, add column mae_points numeric, add column mfe_time timestamptz;` (nullable, no backfill).
- `src/routes/api/public/auto-trader/tick.ts` includes the three fields in the journal upsert.
- `listPerfTrades` in `src/lib/performance.functions.ts` selects the new columns; `performance.tsx` derives the loser-excursion stats client-side and only counts trades where `mfe_points is not null`.
