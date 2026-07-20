
## Auto-Trader (Alerts-Only) — ES/NQ Micros

Deterministic state machine that watches live 1m bars against the day's published plan and emits alerts (Discord + in-app trade card). No orders are placed; you execute manually.

### Rules encoded (from the spec + your answers)

- Armed only when the plan bias is **Bullish** and only during **RTH 09:30–16:00 ET**.
- One active trade at a time. No re-entry from the same level once stopped or closed.
- Entry trigger: a 1m bar's **low touches** a published support level (T1↓, T2↓, T3↓, or Pivot) — the first valid pullback wins.
- Position: **3 MES** (ES → MES, NQ → MNQ) at the trigger price.
- Initial stop: **one published level below** the entry level (from the ladder Pivot, T1↓, T2↓, T3↓ sorted desc).
- Scale-Out #1: at the **next published level up** → sell 1, move stop → **Breakeven**.
- Scale-Out #2: at the **next published level up** → sell 1, move stop → **prior target level** (once accepted).
- Runner: hold last contract toward the final published upside target (T3↑).
- Level acceptance = any touch of the next level (per your answer).
- If final target is reached, compute **EXT1** = final target + average spacing of all upside published levels (Pivot→T1↑→T2↑→T3↑); continue trailing stop to most recently accepted level until EXT1 hit or stop hit.
- If initial stop hits → trade closed, disarmed for the day.

### Architecture

**New files**

- `src/lib/auto-trader/state.ts` — pure state machine `advance(state, bar) → { state, events[] }`. Deterministic, unit-testable, no I/O. States: `idle → armed → in_trade(scaled=0|1|2|runner) → closed`. Events: `entry`, `scale1`, `scale2`, `stop_moved`, `stop_hit`, `target_hit`, `ext1_hit`, `closed`.
- `src/lib/auto-trader/levels.ts` — helpers: build the ordered ladder from a plan row, "next level above/below", "average spacing", EXT1.
- `src/lib/auto-trader/use-auto-trader.ts` — React hook. Consumes the live ES/NQ 1m feed (already provided by `useEsFeed`) + current plan; advances state on every new bar; persists last-seen bar time in `localStorage` so a reload replays only unseen bars.
- `src/components/auto-trader/TradeCard.tsx` — live card on the Plan page: bias/status pill, entry, current stop, remaining contracts, unrealized P/L (in points), event log for the day.
- `src/components/auto-trader/AutoTraderToggle.tsx` — arm/disarm switch + "Reset day" (in case you want to re-arm after manual override). Preferences stored in `localStorage`.

**Wired into**

- `src/routes/index.tsx` — mount `<TradeCard />` under the Plan panel; use the same `symbol` (ES/NQ) and `plan` already resolved there.

### Alerts

- **In-app**: TradeCard updates live; a small toast (`sonner`) fires on each state transition.
- **Discord**: reuse the existing "copy for Discord" pattern — every event appends a formatted line to a copy-to-clipboard block on the TradeCard (no webhook infra changes). Example: `🟢 ENTRY MES 3x @ 7402.75 | Stop 7394.75 (T2↓)`.
- Optional Discord webhook (opt-in, later): if you want push-to-Discord instead of copy, we'd add a `DISCORD_WEBHOOK_URL` secret + a `src/routes/api/public/auto-trader/notify.ts` server route. Not part of this plan unless you say so.

### Data flow

```text
useEsFeed(symbol) ──▶ useAutoTrader(plan, bars, symbol)
                              │
                              ▼
                        state machine
                              │
                     ┌────────┴────────┐
                     ▼                 ▼
                TradeCard        toast + copy block
```

### Edge cases handled

- Bias ≠ Bullish → disarmed, TradeCard shows "waiting for bullish plan".
- No plan or missing levels → disarmed.
- Bar timestamps outside 09:30–16:00 ET → ignored.
- Multiple levels crossed in a single bar → resolve in order using the bar's low→high sweep against the current state (worst-case first: stop before scale, unless bar's open is already past scale).
- Reload/tab close: `localStorage` snapshots `{ symbol, planDate, tradeState, lastBarTime, eventLog }` — restored on mount.

### Out of scope (call out explicitly)

- No live broker orders. Schwab integration remains read-only.
- Short/Bearish auto-trading is not implemented (spec only defines LONG). Easy mirror later.
- No position sizing beyond the fixed 3 micros.

### Verification

- Unit tests on `state.ts` for: touch entry, scale ladder, BE after scale1, stop-to-prior-target after scale2, final-target → EXT1 flow, stop-hit before any scale, no re-entry.
- Manual: switch chart to ES, wait for RTH; TradeCard should stay idle if bias isn't Bullish; force a Bullish plan and watch events fire against live bars.
