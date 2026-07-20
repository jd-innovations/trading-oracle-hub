## Add NEUTRAL auto-trader mode (both sides, re-armable)

Extend the state machine to handle Neutral bias as its own "mode" that arms both sides from T2/T3 only, then re-arms the opposite side after each completed leg.

### 1. `src/lib/auto-trader/levels.ts`

Add two selectors that isolate the neutral entry zones:

- `neutralLongEntries(ladder)` → `[T2↓, T3↓]` ordered nearest-to-Pivot first (i.e. T2↓ then T3↓). Used for highest-support-in-range entry scan.
- `neutralShortEntries(ladder)` → `[T2↑, T3↑]` ordered nearest-to-Pivot first.

Existing `levelBelow` / `levelAbove` (initial stop) and `levelsAbove` / `levelsBelow` (ladder ahead) are reused untouched — a long from T3↓ still gets stop = extension via the existing "no level below" fallback, matching "one published level beyond".

### 2. `src/lib/auto-trader/state.ts`

Introduce a `mode` and an "arm side" concept.

```ts
type Mode = "directional" | "neutral";
type ArmSide = "long" | "short" | "either";

interface CompletedLeg {
  side: Side;
  entry: number; entryLabel: string;
  exit: number;  exitLabel?: string;
  phase: "closed_win" | "stopped";
  realized: number;
}

interface TradeState {
  mode: Mode;
  armSide: ArmSide;       // what we're currently watching for
  side?: Side;            // active leg's side (undefined while armed "either")
  ...existing fields...
  completedLegs: CompletedLeg[];
}
```

- `initialState(plan, symbol)` picks:
  - `Bullish` → `mode: "directional"`, `side: "long"`, `armSide: "long"`.
  - `Bearish` → `mode: "directional"`, `side: "short"`, `armSide: "short"`.
  - `Neutral` → `mode: "neutral"`, `armSide: "either"`, `side` undefined.
- `advance()` entry block, when `phase === "armed"`:
  - **Directional**: unchanged.
  - **Neutral**:
    - If `armSide` allows short (`"short"` or `"either"`), scan `neutralShortEntries(ladder)` — pick the *lowest* resistance where `bar.high >= lv && bar.open <= lv` (gap-through fallback: lowest with `bar.high >= lv`).
    - If `armSide` allows long, scan `neutralLongEntries(ladder)` — pick the *highest* support where `bar.low <= lv && bar.open >= lv` (fallback: highest with `bar.low <= lv`).
    - If both fire on the same bar (armSide `"either"`), pick whichever entry level is closer to `bar.open` (the one first tagged given the bar's open direction).
    - Set `side` to the chosen side, then follow the same stop / `ladderAhead` construction the directional path already uses (`levelBelow`/`levelsAbove` for long, `levelAbove`/`levelsBelow` for short). For neutral, `ladderAhead` includes all levels through the *far* side of the ladder — the existing runner-trailing logic naturally implements "hold to Pivot or continue trailing".
- **EXT1 suppression for neutral**: when `mode === "neutral"`, skip the "append EXT1 after final published accepted" branch. Runner just stops advancing once `acceptedIdx` hits the end of `ladderAhead`; stop remains at the most-recently-accepted level and only a reversal can close the runner.
- **Leg completion + re-arm (neutral only)**: when a neutral trade closes (stop_hit **or** final level accepted with runner still open), instead of terminal `closed_win`/`stopped`:
  1. Push `CompletedLeg` derived from current `side`, `entry`, `entryLabel`, exit price/label, phase, and this leg's realized pts.
  2. Reset per-leg fields: `entry`/`entryLabel`/`entryTime`/`stop`/`stopLabel` → undefined, `contracts = 3`, `scaled = 0`, `ladderAhead = []`, `acceptedIdx = -1`, `ext1` undefined, `side` undefined.
  3. `armSide` becomes the **opposite** of the completed leg's side (guarantees "opposite edge" re-entry, T2/T3 only).
  4. `phase` returns to `"armed"`. Emit a `closed` event with a `note` like `"Leg closed +X.X pts · re-arm for SHORT at T2↑/T3↑"`.
  5. `realizedPoints` stays cumulative across legs.
- Directional mode remains terminal on closure (no re-arming, no legs list beyond the single closed trade).

### 3. `src/lib/auto-trader/use-auto-trader.ts`

- Drop the Neutral gate: allow `plan.bias === "Neutral"` through. `disabledReason` returns null when a plan exists and enabled, regardless of bias.
- Storage key bump: `auto-trader:v3:{sym}:{date}` so v2 (long+short only) blobs are discarded on load.
- Toast copy: on entry, include side (`LONG @ T2↓ …` or `SHORT @ T3↑ …`). On leg re-arm, toast `"Leg complete — re-armed for SHORT (T2↑/T3↑)"` (or LONG).

### 4. `src/components/auto-trader/TradeCard.tsx`

- Title suffix reflects mode: `Auto-Trader · MES (LONG)` / `(SHORT)` / `(NEUTRAL)`.
- Status pill:
  - `ARMED · NEUTRAL — either` when neutral + armSide `"either"`.
  - `ARMED · NEUTRAL → LONG` / `→ SHORT` when neutral + armSide is a specific side (post-completed-leg).
  - Directional pill text unchanged.
  - `IN TRADE · NEUTRAL · LONG · 3x` etc. once a neutral leg is live.
- Above the stats grid, when neutral, render a compact summary strip: `Legs: 2 · +14.25 pts` listing completed legs with an entry-label → exit-label chip each, tone-coded per leg P/L.
- Ladder-chip tone follows the *current leg's* `state.side` (already implemented). No chips shown while armSide `"either"` and no active leg.
- Discord copy: header adds mode label (`NEUTRAL`), event log continues to include every leg's events in chronological order (they already accumulate).

### Verification (build mode)

- Neutral plan → TradeCard shows `ARMED · NEUTRAL — either`, no ladder chips.
- Simulate rally into T2↑: entry short 3x, stop = T3↑, ladder chips show `T1↑ Pivot T1↓ T2↓ T3↓` (desc). Scale-1 at T1↑ → stop BE. Scale-2 at Pivot → stop T1↑. Runner trails through T1↓/T2↓/T3↓; no EXT1 appended.
- Stop-out on that leg → status flips to `ARMED · NEUTRAL → LONG`, legs summary shows the closed short, TradeCard resumes watching T2↓/T3↓ only.
- Simulate dip into T2↓: long leg opens, symmetric behavior, mirror ladder descending in profit (asc) direction.
- No entry ever triggers from Pivot or T1 in neutral mode.
- Bullish and Bearish plans still behave exactly like before — single-leg, terminal on close, EXT1 still appended.
