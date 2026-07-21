## Goal
Replace the mock Journal with real ES/NQ activity captured from the Auto-Trader and the Daily Plan / Session Results flows.

## What gets logged

**Trades (Auto-Trader legs)** — one row per completed leg (both directional stop/target closes and Neutral leg re-arms).
- symbol (ES/NQ), plan_date, side (long/short), bias (from plan)
- entry price + label, exit price + label, entry_time, exit_time
- phase: `closed_win` | `stopped`
- realized_points (from `CompletedLeg.realized`), contracts
- Computed `pnl_usd` = points × contract multiplier (ES $50/pt, NQ $20/pt)
- notes: entry/exit label pair, e.g. "PIVOT → T2↑"

**Plans (Daily Plan summaries)** — one row per plan_date/symbol.
- bias, pivot, targets, score (from `computePlanResults` once available)
- Written when the plan is generated; score/close/H/L back-filled when Results are computed

## Data model

New table `public.journal_entries` (RLS scoped to `auth.uid()`):
- `id`, `user_id`, `created_at`, `updated_at`
- `kind` text: `'trade' | 'plan'`
- `symbol` text: `'ES' | 'NQ'`
- `plan_date` date
- Trade fields: `side`, `bias`, `entry_price`, `entry_label`, `exit_price`, `exit_label`, `entry_time` timestamptz, `exit_time` timestamptz, `phase`, `realized_points` numeric, `contracts` int
- Plan fields: `pivot`, `score` int, `session_high`, `session_low`, `session_close`
- Common: `notes` text
- Unique index `(user_id, kind, symbol, plan_date, entry_time)` for trades and `(user_id, kind, symbol, plan_date)` for plans (partial indexes) so re-emits upsert cleanly.

## Server functions (`src/lib/journal.functions.ts`)
- `logAutoTraderLeg({ symbol, planDate, leg, bias, entryTime, exitTime, contracts })` — upsert one trade row.
- `logDailyPlan({ symbol, planDate, bias, pivot, ... })` — upsert plan row on generate.
- `logPlanResults({ symbol, planDate, score, high, low, close })` — update the plan row after results compute.
- `listJournal({ symbol?: 'ES'|'NQ'|'All', from?, to? })` — return combined rows sorted by date desc.

All use `requireSupabaseAuth` (context.supabase, RLS as user).

## Wiring

1. `src/lib/auto-trader/use-auto-trader.ts` — after `advance` returns a state whose `completedLegs.length` grew, call `logAutoTraderLeg` for each newly added leg (client-side via `useServerFn`). Idempotent via unique index on `(user_id, kind, symbol, plan_date, entry_time)`.
2. `src/lib/plans.functions.ts` — inside `generateDailyPlan` handler, after upserting `daily_plans`, insert/update the corresponding `journal_entries` plan row (server-side, same user).
3. `computePlanResultsFn` — after computing results, update the journal plan row with score/H/L/C.

## Journal page (`src/routes/journal.tsx`)
- Drop mock import; fetch via `listJournal` using `useSuspenseQuery` in the standard loader/ensureQueryData pattern.
- Instrument filter: `All | ES | NQ` (SPX removed — user scope is ES/NQ only).
- Two visual row types:
  - **Trade row**: date · symbol chip · side badge · "ENTRY_LABEL → EXIT_LABEL" · points · $P&L
  - **Plan row**: date · symbol chip · "Daily Plan — {bias}" · score · session H/L/C
- Summary chip (top-right): total $P&L, win count, plan avg score for filtered range.
- Mobile card layout and desktop table both updated for the new shape.

## Out of scope
- SPX Iron Fly entries (module isn't wired to real trades yet).
- Manual entry/edit UI.
- Pulling Schwab fills.
- Backfilling historical mock rows — journal starts empty and fills as trades/plans occur.

## Technical notes
- Contract multipliers live in `src/lib/symbols.ts` (add `pointValue: 50` for ES, `20` for NQ).
- `fmtSigned` continues to render `$` amounts; `mono` class already applied.
- Migration creates table + GRANTs (`authenticated`, `service_role`) + RLS policies (`auth.uid() = user_id` for all ops) + `updated_at` trigger.
