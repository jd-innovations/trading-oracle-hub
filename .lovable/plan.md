# RTH Profile Levels on ES Chart

Auto-render market-profile style levels on the ES candlestick chart. ES-only (skipped for SPX). Covers all visible RTH sessions, with a guaranteed minimum of 30 historical sessions of data. No UI toggles.

## What gets plotted

Per RTH session (09:30–16:00 ET):
- **POC** — TPO-derived: 30-min letter brackets (A=09:30, B=10:00, … M=15:30), price bin = 0.25 (ES tick). POC = bin touched by the most brackets.
- **VAH / VAL** — 70% Value Area expanded around POC using standard TPO pair-step algorithm.
- **Single prints** — any 0.25 bin touched by exactly one bracket (excluding session high/low extremes). Drawn as short bracketed segments.
- **Poor High / Poor Low** — session extreme touched by ≥2 TPO brackets within 2 ticks (0.50) of the extreme.

Per 30-min RTH candle (only when chart timeframe = 30m, layered on top of session levels):
- **30m POC** — busiest 0.25 bin computed from the underlying 2m bars inside that 30m window.

## Ray extension rule

Every level draws as a horizontal ray starting at the bar where it became "known" (session end for session levels, candle close for 30m POCs) and extends to the right until a later bar's range trades fully through it (`bar.low <= price <= bar.high`). The current/incomplete session draws levels live from the most recent completed bracket and extends to chart edge.

## Labels

Right-edge text labels rendered by the primitive:
- `POC 06/13`, `VAH 06/13`, `VAL 06/13`, `SP 06/13`, `PDH 06/13` / `PDL 06/13` (poor high/low)
- `30m POC 14:00` for per-30m POCs

Session-day stamp keeps multi-day overlap readable. Color palette uses existing theme tokens (POC = yellow/pivot, VAH = bull, VAL = bear, singles = muted info, poor H/L = warn).

## Data coverage

Mock generator currently produces ~200 × 2m bars (~6.6 hrs) — not enough for 30 RTH sessions. Extend `genCandles` (or add a session-aware generator) so `esCandles` spans ≥ 30 RTH days with realistic overnight gaps. SPX generator left untouched.

## Files

**New:**
- `src/lib/profile-levels.ts`
  - `computeRthSessions(candles)` → groups bars into ET RTH session days
  - `computeTpoProfile(sessionBars)` → `{ poc, vah, val, singles[], poorHigh?, poorLow? }` using 30m brackets + 0.25 bins + 70% VA expansion
  - `compute30mPocs(sessionBars)` → `Array<{ time, poc }>`
  - `extendRays(levels, allBars)` → assigns `rightEdge` per level using full-trade-through rule
  - Exports `ProfileLevel` type `{ kind, price, startTime, endTime, label, color }`
- `src/components/charts/ProfileLevelsPrimitive.ts` — `ISeriesPrimitive` that draws horizontal ray segments + right-edge labels. Mirrors `OpeningRangePrimitive` structure (uses `PriceToCoordinateConverter` / `TimeToCoordinateConverter`, theme-aware via `toRgb`).

**Modified:**
- `src/lib/mock/data.ts` — extend ES candle generator to produce ≥30 RTH sessions worth of 2m bars with overnight gaps; keep deterministic seed.
- `src/components/charts/Charts.tsx` — accept `profileLevels?: ProfileLevel[]` prop, attach a `ProfileLevelsPrimitive` alongside the existing `OpeningRangePrimitive`, push updates without remount (same pattern as `zonesRef`).
- `src/components/charts/EsChartPanel.tsx` — when `symbol === "ES"`:
  - memoize session levels from raw `esCandles`
  - when `timeframe === "30m"` (add to `TF_MIN`/toolbar if not present — currently 2/5/15/RTH; will add `30m`) also compute per-30m POCs
  - pass merged `profileLevels` to `EsCandleChart`; pass `[]` for SPX
- `src/components/charts/ChartToolbar.tsx` — add `30m` to the `Timeframe` union and toggle group so the 30m-POC overlay has a way to be triggered.

## Out of scope

- No popover/toggle UI (auto-on for ES per spec).
- No volume-weighted profile (using TPO + bar-count proxy where TPO needs sub-bracket detail).
- No persistence — purely derived from candles.
- SPX intentionally skipped.
