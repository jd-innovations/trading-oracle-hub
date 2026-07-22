
## Goal

Auto-trader alerts post to Discord live during RTH regardless of whether anyone has the app open. Today the state machine only runs in the browser tab, so alerts stop the moment the tab closes.

## Approach

Move the auto-trader loop to the server. A pg_cron job hits a public TSS route once a minute during RTH; the route pulls fresh Schwab bars for ES and NQ, advances state stored in the database, and posts newly generated events to the existing Discord webhook. The browser hook keeps working for people watching the page but no longer owns the source of truth.

## Changes

### 1. New table `public.auto_trader_state`
- Columns: `user_id uuid`, `symbol text`, `plan_date date`, `state jsonb` (the full `TradeState`), `posted_event_count int default 0`, `logged_leg_count int default 0`, `updated_at`.
- Primary key `(user_id, symbol, plan_date)`.
- Standard GRANTs; RLS: owner can select their row; writes only via `service_role` (the cron route).

### 2. Extract pure state advance into a shared module
- Move the per-bar loop currently inside `useAutoTrader` into a plain helper (`advanceForBars(state, plan, bars)`) already largely present in `src/lib/auto-trader/state.ts`. No behavior change — just make sure it's importable server-side without React.

### 3. New TSS route `src/routes/api/public/auto-trader/tick.ts`
- POST, secured by `apikey` header (Supabase anon key) — matches the existing cron pattern.
- For each of `ES` and `NQ`:
  1. Load the Schwab owner id (`getSchwabOwnerUserId`) and today's plan row.
  2. Load or initialize the `auto_trader_state` row for `(owner, symbol, plan_date)`.
  3. Skip if state is terminal (`stopped` / `closed_win` in directional mode) or outside RTH.
  4. Fetch recent Schwab 1-min bars (small lookback, e.g. last 2 hours).
  5. Run `advanceForBars`.
  6. For events beyond `posted_event_count`, POST each to the Discord webhook using the same formatting as `useAutoTrader` (`eventEmoji` + ET time + note).
  7. For completed legs beyond `logged_leg_count`, insert into `journal_entries` (mirror of current client behavior).
  8. Upsert the new state + counters.
- Uses `supabaseAdmin` (loaded inside the handler) for state and journal writes; Discord webhook URL read from `process.env.DISCORD_WEBHOOK_URL`.

### 4. pg_cron schedule
- Enable `pg_cron` + `pg_net` if not already.
- Schedule `auto-trader-tick` every minute Mon–Fri 9:30–16:00 ET (`30-59 13 * * 1-5`, `* 14-19 * * 1-5`, `0 20 * * 1-5` — cron is UTC; will adjust for DST vs EST at implementation time; simplest is every minute weekday and let the route no-op outside RTH).
- Body `{}`, header `apikey: <anon>`.

### 5. Client hook cleanup
- `useAutoTrader` keeps advancing locally for the on-screen display, but Discord posting and journal logging are gated off when a `serverAuthoritative` flag is set (default on). This prevents duplicate posts when both the tab and the server tick.
- Add a small subscription (poll every ~30s or on focus) to `auto_trader_state` so the on-screen card reflects server truth rather than diverging local state.

### 6. Not changed
- Manual "Post" / "Test" buttons and the test-event button stay client-driven.
- Plan generation and results grading stay as-is.

## Technical notes

- Discord posts from the cron route call `fetch(DISCORD_WEBHOOK_URL, …)` directly (same body shape as `discord.functions.ts`) — no need to route through a server fn.
- The cron route is idempotent by design: `posted_event_count` and `logged_leg_count` prevent double-posts if a tick overlaps.
- Every state mutation is a single upsert, so concurrent ticks (shouldn't happen with 1-min cadence, but safe) don't corrupt the row.
- `supabaseAdmin` is imported inside the handler per the client.server rule.

## Verification

- Manually POST the tick route with the anon `apikey` after market open and confirm: DB row updated, at least a heartbeat log, no Discord spam when nothing changed.
- Force an event by seeding a state row near a level and re-ticking; expect one Discord message.
- Close the browser entirely, wait for cron, confirm live posts continue.
