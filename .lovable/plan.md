# Opening Range Indicator

Add a configurable Opening Range (OR) indicator to the ES/SPX chart. Each zone captures the high/low of a user-defined time window (default 2 minutes), then projects forward as a shaded band + dashed boundary lines until price trades fully through (a later bar's high > zoneHigh AND low < zoneLow). Zones are managed via a popover from the chart toolbar and persisted to localStorage.

## Default zones

All times ET. Six defaults, each 2 minutes long:

| Label | Time | Session |
|---|---|---|
| Globex PM Open | 18:00–18:02 | Globex only (ES) |
| London Pre | 03:00–03:02 | Globex only (ES) |
| Pre-Market | 07:00–07:02 | Globex only (ES) |
| RTH Open | 09:30–09:32 | RTH (ES + SPX) |
| Lunch Reversal | 11:30–11:32 | RTH (ES + SPX) |
| Power Hour | 15:00–15:02 | RTH (ES + SPX) |

For SPX, Globex-only zones are auto-hidden (SPX has no data outside RTH). User can still toggle them but they render nothing when no bars fall in the window.

## Behavior

- **Formation**: For each session day in the visible data, find bars whose timestamp falls inside `[start, start+duration)`. Zone high = max(high), zone low = min(low). Zone "born" at window end.
- **Extension**: Walk forward from zone end. Zone stays active until a bar satisfies `bar.high > zoneHigh && bar.low < zoneLow` (full break of both sides). Right edge of the rectangle = that bar's time (or last bar if never broken).
- **Per-day**: Each trading day produces its own zone instance. On a 200-bar mock dataset that's typically 1 day, but logic supports multiple.

## Visuals

- Shaded rectangle between OR-high and OR-low, ~15% opacity zone color.
- Dashed boundary lines at high and low (solid 1px, dashed style).
- Text label at the left edge: e.g. `9:30 OR`.
- Each default zone gets a distinct color (cycled from a small palette: cyan, amber, magenta, teal, orange, violet).

Implemented with `lightweight-charts` v5 primitives:
- Rectangle band → `chart.addSeries(AreaSeries)` is not suitable; use **custom series primitive** via `ISeriesPrimitive` attached to the candlestick series. Primitive draws a filled rect + two dashed horizontal segments + a text label on the canvas in the price/time coordinate space.
- One primitive instance per zone instance (per-day × per-config).

## Configuration UI

New "Ranges" button in `ChartToolbar` (next to Fit / Fullscreen), opens a shadcn `Popover` containing:

- List of zones, each row: enable toggle (Switch) · color swatch · label (editable) · start time (HH:MM input) · duration minutes (number input, default 2) · session scope (RTH / Globex / Both — small Select) · delete button.
- "Add zone" button at the bottom appends a blank row.
- "Reset to defaults" link restores the 6 presets.

Changes apply live (no save button). On SPX, Globex-scoped rows are dimmed with a "RTH only" hint and produce no zones.

## Persistence

- Stored in `localStorage` under key `chart.openingRanges.v1` as JSON array of `OpeningRangeConfig`.
- Read on mount via a small `useOpeningRanges()` hook returning `[configs, setConfigs]` with debounced write.
- If parse fails or key missing, seed with the 6 defaults.

## Files to add / change

**New**
- `src/lib/opening-ranges.ts` — types (`OpeningRangeConfig`, `OpeningRangeZone`), `computeZones(candles, configs, symbol)` returning concrete zone instances with `{ startTime, endTime, high, low, label, color, broken }`, and `DEFAULT_OPENING_RANGES`. Pure functions, easy to unit-test.
- `src/lib/use-opening-ranges.ts` — localStorage-backed hook.
- `src/components/charts/OpeningRangePrimitive.ts` — `ISeriesPrimitive` implementation that renders a list of zones (rect fill, dashed top/bottom lines, label) using `PriceToCoordinateConverter` and `TimeToCoordinateConverter` from lightweight-charts v5.
- `src/components/charts/OpeningRangesPopover.tsx` — shadcn Popover with the zone editor list (Switch, Input, Select, Button).

**Modified**
- `src/components/charts/Charts.tsx` — `EsCandleChart` accepts a new optional `zones?: OpeningRangeZone[]` prop. After creating the candlestick series, attach the `OpeningRangePrimitive` and call `primitive.setZones(zones)` whenever zones change. Re-attach on theme change like existing logic.
- `src/components/charts/ChartToolbar.tsx` — add `Ranges` button (icon `Layers` from lucide-react). Wire `onOpenRanges` prop; render the popover from the panel.
- `src/components/charts/EsChartPanel.tsx` — call `useOpeningRanges()`, compute zones via `computeZones(source, configs, symbol)` memoized on `[source, configs, symbol]`, pass to `EsCandleChart`. Mount `OpeningRangesPopover` controlled by toolbar button.

## Edge cases

- Window straddles midnight (e.g. 18:00 PM zone) — group bars by ET session day, not UTC date.
- Empty zone (no bars in window for a given day) → skipped, not rendered.
- Resampled timeframes (5m, 15m) — compute zones from the **raw 2m source**, not the resampled data, so the OR window resolution is preserved. Then render against whatever timeframe is shown; the primitive uses time coordinates so it lines up correctly.
- RTH filter active + Globex zone → zone is skipped (no bars to anchor it).
- Theme switch → primitive re-reads CSS color tokens via existing `toRgb` / `withAlpha` helpers in `src/lib/color.ts`.

## Out of scope (for this iteration)

- Alerts when price touches/breaks a zone.
- Backtest stats on OR break rate.
- Per-zone customization of break logic (single-side break, close-based, etc.) — only "full trade through" is implemented now.
- Syncing config across devices (no Cloud yet).
