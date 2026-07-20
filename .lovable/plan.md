## What we know

- Test event round-trips fine, so Discord + hook + toggle are healthy.
- NQ plan generated and posted at 8:30, so `planRow` is present and `initialState` armed the machine.
- Bars are Schwab 1m /NQ candles with `time` in seconds; `isRthBar` and the date-key gate are correct for July.
- Entry rules today:
  - **Bullish** → pool = `supportLevels` = Pivot + T1↓/T2↓/T3↓ only.
  - **Bearish** → pool = `resistanceLevels` = Pivot + T1↑/T2↑/T3↑ only.
  - **Neutral** → pool = T2↑/T3↑ (short) or T2↓/T3↓ (long); Pivot and T1 are intentionally excluded.
- A bar fires an entry only if `bar.low <= level` (primary: bar also opens on the other side; fallback: any bar whose low crosses the level).

That means the two realistic reasons NQ never entered are:

1. **Correct-by-rules skip.** Bullish bias but NQ opened above Pivot and never pulled back to Pivot or below — or bearish and never rallied back to Pivot or above — or Neutral and price stayed inside T1↑/T1↓ all day. Nothing to fix; the rules did their job.
2. **Real bug.** A qualifying bar existed (its low touched a pool level) but the state machine skipped it — e.g. bar-time gate rejected it, plan-date mismatch, `symbolId` on the card not matching the bars, or the pool selector picked the wrong side.

Without per-bar signal we can't tell (1) from (2). The fix is to make the auto-trader *explain itself*, then act on what it says.

## Plan

### 1. Live "entry gate" panel on the Auto-Trader card (while ARMED)

Under the status pill, render a small diagnostic block that only shows while `phase === "armed"`:

- The active entry pool (from the ladder + current mode/side/armSide) with each level's price.
- For each pool level, the **closest approach today**: `min(low - level)` for supports, `min(level - high)` for resistances, computed across today's RTH bars we've seen. Green when ≤ 0 (already tagged), amber otherwise, with the ET timestamp of the closest bar.
- A one-liner reason: `"Waiting on pullback to <label> <price> — closest so far <closestPrice> @ HH:MM (Δ <n> pts)"`.

If the closest approach is ≤ 0 for a level but no entry fired, that's a bug and we investigate; if every level's Δ stays positive, the day just didn't offer a setup (rule-correct).

### 2. One-line per-bar console trace behind a flag

New `localStorage` key `auto-trader:debug` (default off). When on, every RTH 1m bar prints a compact line: `[at] et HH:MM open/high/low/close · phase=<> side=<> pool=[label:price …] hit=<label?|none>`. Turn on for the NQ session tomorrow (or replay today's session if we can pull the bars), copy/paste the log and we'll see exactly what the state machine saw.

### 3. Sanity-check the wiring while we're in there

- Assert `state.symbol === symbol` on every advance; if the card's `symbol` prop and the persisted state disagree, log a warning and reset (protects against stale localStorage from a prior ES session on the same date).
- Assert the bar's ET date-key matches `planDate` — if the very first bar we see today is being rejected by the date gate we'll surface it as `date-mismatch: bar=2026-07-20, plan=2026-07-17` in the diagnostic block instead of silently ignoring bars.

### 4. Report back and act

After NQ runs one more session (or after we replay today's bars via the existing Schwab 5-day history), the diagnostic block will tell us:
- **All Δ > 0** → the day never gave a valid pullback into an entry level. No code change. Optionally revisit whether Neutral bias should allow T1 entries or Directional should allow entries at the opposite-side Pivot break — but that's a rules decision, not a fix.
- **Some Δ ≤ 0 but no entry** → real bug. Likely candidates in order: symbol mismatch on hydrate, first-bar date-key gate, or `pickLongEntry`/`pickShortEntry` skipping the level because bar.open equals the level (strict `>=` vs `<=` boundary). We'll pinpoint from the console trace and patch.

## Technical notes

- Files touched: `src/components/auto-trader/TradeCard.tsx` (diagnostic block), `src/lib/auto-trader/use-auto-trader.ts` (per-bar trace + wiring asserts), `src/lib/auto-trader/state.ts` (optionally return a `lastReject` reason field for the panel).
- No changes to state.ts's core entry math — we only add read-only diagnostics. If step 4 shows a real bug, that's a follow-up plan.
- Debug console trace is gated by `localStorage.setItem("auto-trader:debug", "1")` to keep production noise low.