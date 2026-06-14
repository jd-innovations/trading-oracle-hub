# Chart Enhancements

## Where the chart lives today

The ES candle chart is on the **Plan tab** (route `/`, the home page).
- File: `src/routes/index.tsx` → renders `<EsCandleChart>` inside the "ES · 2-min · Daily Plan Levels" panel.
- Component: `src/components/charts/Charts.tsx` (`EsCandleChart`) — built on `lightweight-charts`.
- Mock bars: `src/lib/mock/data.ts` → `esCandles` (~200 × 2-min bars).
- The same component is reused on the Iron Fly tab for SPX.

Open the preview at `/` and scroll the left column — the chart sits below the Daily Plan card with horizontal lines for T1/T2/T3 ↑/↓ and Pivot.

## What we'll add

Three controls sit in a new toolbar above the chart canvas.

```text
┌─ ES · 2-min · Daily Plan Levels ──────────────────────────┐
│  [2m] [5m] [15m] [RTH]    GEX ☐    ⛶ Fullscreen           │
├────────────────────────────────────────────────────────────┤
│                                                            │
│              candles + level lines                         │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### 1. Timeframe switch (2m / 5m / 15m / RTH)
- Segmented control rendered above the chart.
- Frontend-only aggregation: a `resampleCandles(bars, minutes)` util buckets the 2-min `esCandles` into the chosen interval (open = first, close = last, high = max, low = min). "RTH" returns the 09:30–16:00 ET subset of 2-min bars.
- Selected timeframe is local component state; switching re-feeds the chart series via the existing `data` prop and `chart.timeScale().fitContent()`.

### 2. GEX visualization
- Toggle checkbox "GEX" in the toolbar.
- When on, the chart overlays horizontal `priceLine`s from `gexLevels` (already in mock data: Call Wall, Gamma Flip, Put Wall, HVL) on top of the existing T1/T2/T3/Pivot lines.
  - Call Wall → green dashed, thicker
  - Put Wall → red dashed, thicker
  - Gamma Flip → amber dashed
  - HVL → muted dashed
  - Line width scaled by `weight`.
- A small legend chip row appears under the toolbar listing the active GEX levels with their price, so users can read them without hovering.

### 3. Fullscreen mode
- ⛶ button in the toolbar.
- Uses the browser Fullscreen API on the chart's wrapper div (`element.requestFullscreen()` / `document.exitFullscreen()`), with a fallback CSS class (`fixed inset-0 z-50 bg-background`) for browsers/contexts where Fullscreen API is blocked (e.g. embedded preview iframes — important since the user views inside Lovable's preview).
- Exit via the same button, `Esc` key, or `fullscreenchange` event.
- The chart's existing `ResizeObserver` already handles the canvas resize, so no chart-internal changes needed beyond letting the wrapper grow.

## Files to change / add

- **New** `src/components/charts/ChartToolbar.tsx` — segmented timeframe control, GEX toggle, fullscreen button. Pure presentational; emits callbacks.
- **New** `src/lib/chart-utils.ts` — `resampleCandles(bars, minutes)` and `filterRTH(bars)` helpers.
- **Edit** `src/components/charts/Charts.tsx` — wrap `EsCandleChart` in a container div ref'd for fullscreen; accept new optional props `showGex?: boolean` and let parent pass merged `lines`. Keep the existing API backward-compatible so the Iron Fly SPX chart is unaffected.
- **New** `src/components/charts/EsChartPanel.tsx` — stateful wrapper that owns timeframe + GEX + fullscreen state, composes `ChartToolbar` + `EsCandleChart`, and computes the lines/data passed down.
- **Edit** `src/routes/index.tsx` — replace the inline `<EsCandleChart .../>` block with `<EsChartPanel />`.

## Out of scope
- No real GEX math — uses existing static `gexLevels` mock.
- No tick-data backend; resampling runs over the existing 2-min mock array.
- Iron Fly SPX chart keeps its current simple form (we can promote it to the same panel later if you want).
