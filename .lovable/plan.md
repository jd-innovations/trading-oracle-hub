## Add SHORT-side auto-trader

Mirror the existing LONG state machine so a Bearish plan arms a short auto-trader with the same 3-contract, two-scale, trailing-runner + EXT1 structure — just inverted.

### 1. `src/lib/auto-trader/levels.ts`

Add short-side helpers alongside the existing long ones:

- `resistanceLevels(ladder)` → Pivot and above (Pivot … T3↑), ascending.
- `levelsBelow(ladder, entryLabel)` → levels strictly below entry, **descending** (nearest first).
- `levelAbove(ladder, entryLabel)` → one published level above entry (for the initial short stop).
- `downsideAvgSpacing(ladder)` → avg spacing between T3↓…Pivot.
- `ext1PriceShort(ladder)` → first published downside − downside avg spacing (i.e. `T3↓ − avg`).

Keep the long helpers untouched.

### 2. `src/lib/auto-trader/state.ts`

Generalize the state machine to be direction-aware.

- Add `side: "long" | "short"` to `TradeState`. `initialState(plan, symbol)` picks `"short"` when `plan.bias === "Bearish"`, `"long"` when `"Bullish"`. If Neutral, no state is created (existing hook gate already handles this).
- Rename `above` to `ladderAhead` (levels in the trade's profit direction; descending for shorts, ascending for longs). Persisted state carries the new field name — hydrate old localStorage entries by treating a missing `ladderAhead` as a fresh init.
- Inside `advance()`:
  - **Entry (short)**: scan resistance levels top-down; entry = lowest resistance with `bar.high >= level && bar.open <= level` (first tag from below). Fallback: lowest resistance with `bar.high >= level` (gap-through). Initial stop = one level above (or synthetic `entry + downsideAvgSpacing` if entering at T3↑).
  - **Stop check (short)**: `bar.high >= stop` → close all, realized = `(entry − stop) * contracts`.
  - **Acceptance sweep (short)**: iterate `ladderAhead` (descending). A level is touched when `bar.low <= level`. Transitions mirror long:
    - `scaled 0 → 1`: buy back 1 @ scale-1 (`ladderAhead[0]`), stop → BE (entry), realized += `(entry − price)`.
    - `scaled 1 → 2`: buy back 1 @ scale-2, stop → `ladderAhead[0]` (scale-1 price).
    - Runner: as each further level accepted, stop → previously-accepted level.
  - **Realized P/L (short)**: `(entry − exit) * contracts` at every reduction.
  - **EXT1 (short)**: when the final published downside is accepted, append `{ price: ext1PriceShort(ladder), label: "EXT1" }` to `ladderAhead`. When EXT1 itself is accepted, close and mark `closed_win`.

Keep `isRthBar` / `etDateKey` gating unchanged.

### 3. `src/lib/auto-trader/use-auto-trader.ts`

- Change the bias gate from `!== "Bullish"` to `bias === "Neutral"` for the "idle" reason.
- `disabledReason` text becomes `"Plan bias is Neutral — auto-trader idle."` when Neutral; otherwise unchanged.
- Storage key already includes symbol+date; bump to `auto-trader:v2:{sym}:{date}` so pre-existing long-only states don't collide with the new schema.

### 4. `src/components/auto-trader/TradeCard.tsx`

- Title shows side: `Auto-Trader · MES (LONG)` / `(SHORT)` derived from `state.side`.
- Status pill text: `IDLE · NEUTRAL` when Neutral, `ARMED · SHORT` / `ARMED · LONG` otherwise.
- Ladder-chip section label becomes `Ladder ahead of entry` (works for both).
- Unrealized P/L uses `(livePrice − entry) * contracts` for longs and `(entry − livePrice) * contracts` for shorts.
- Entry note templates: `"LONG 3x @ …"` / `"SHORT 3x @ …"`.
- Event verbs mirror direction: shorts show `Scale-1: covered 1 @ …`, longs keep `sold 1 @ …`.

### Verification (build mode)

- Bearish plan → TradeCard shows `ARMED · SHORT`, ladder chips list T1↓/T2↓/T3↓ (+ EXT1 once final accepted).
- Simulate: entry at Pivot, first bar back down through T1↓ → Scale-1 fires, stop pill flips to `BE`. Bar through T2↓ → Scale-2, stop → T1↓. Bar through T3↓ → EXT1 appears in ladder, stop → T2↓. Bar through EXT1 → `CLOSED +pts`.
- Simulate stop: bar with `high >= initial stop` closes trade to `STOPPED` with negative realized pts.
- Bullish plan still behaves exactly as today (long path unchanged).
- Neutral plan → auto-trader idle, no state created.
