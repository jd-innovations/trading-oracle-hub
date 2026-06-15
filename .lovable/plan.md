## 1. SPX GEX from Tradier options chain

Add a server-computed gamma-exposure model that reads the live SPX option chain from Tradier (live brokerage token already wired) and returns the key levels the chart can plot.

**New server module — `src/lib/gex.server.ts`**
- `fetchSpxChain(token, expiration)` → `GET /v1/markets/options/chains?symbol=SPX&expiration=YYYY-MM-DD&greeks=true` (Tradier returns gamma directly when `greeks=true`).
- `fetchSpxExpirations(token)` → `GET /v1/markets/options/expirations?symbol=SPX` to pick the nearest N expirations.
- `fetchSpxSpot(token)` → `GET /v1/markets/quotes?symbols=SPX` for current price (needed for dollar-gamma weighting and flip search).
- `computeGex(chain, spot)` — for each strike: `dealerGamma = (callOI * callGamma) - (putOI * putGamma)`, scaled by `spot² * 100 * 0.01` to get $/1% move (standard SpotGamma-style formula). Aggregates by strike across selected expirations.
- Derived levels returned:
  - **Call Wall** — strike with the largest positive call-gamma exposure above spot.
  - **Put Wall** — strike with the largest absolute negative put-gamma exposure below spot.
  - **Gamma Flip** — strike where cumulative dealer gamma crosses zero (linear interp between adjacent strikes).
  - **Largest +GEX / −GEX** — top absolute strikes overall (optional secondary lines).

**New server fn — `src/lib/gex.functions.ts`**
- `getSpxGex({ expirations: number })` → returns `{ levels: GexLevel[], asOf, spot, error? }`. Uses nearest 1–3 expirations (default 1 = 0DTE/next). Silent fallback to `[]` if no token / not entitled / API error — chart keeps showing the existing mock `gexLevels` in that case.

**Client wiring — `src/lib/use-spx-gex.ts`**
- `useSpxGex(enabled)` — react-query-style polling every 60s via `useServerFn`. Returns `{ levels, asOf, isLive }`.

**Chart wiring — `EsChartPanel.tsx`**
- When `symbol === "SPX"` and `showGex` is on, swap `gexLevels` (mock) for the live levels. ES keeps mock. Header pill: small "GEX LIVE · 10:42:13" timestamp when live data is present.
- Color/label mapping stays the same (`Call Wall`, `Put Wall`, `Gamma Flip`, etc.) so `gexColor()` already handles them.

**Out of scope**: per-strike GEX histogram panel, dealer-positioning model toggles, multi-expiration UI selector (hard-coded to nearest 1 expiration for v1; easy to add a dropdown later).

**Risks**: Tradier index-option greeks require options entitlement on the brokerage account. If `greeks` come back null, we fall through to the mock silently (same pattern as the price feed).

## 2. Time label under every visible candle

**`src/components/charts/Charts.tsx`** — adjust the `lightweight-charts` time-scale config on `EsCandleChart`:

```ts
timeScale: {
  borderColor: grid,
  timeVisible: true,
  secondsVisible: false,
  rightOffset: 4,
  barSpacing: 8,           // wider default so labels fit
  minBarSpacing: 6,        // prevent the lib from thinning labels on zoom-out
  tickMarkFormatter: (time) => {
    const d = new Date(time * 1000);
    const h = (d.getUTCHours() - 4 + 24) % 24;   // ET, matches filterRTH
    const m = d.getUTCMinutes();
    return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
  },
}
```

`lightweight-charts` still auto-skips overlapping labels at extreme zoom-outs (unavoidable — the library guarantees no overlap), but with `minBarSpacing: 6` every bar gets its own slot at normal/zoomed-in views, so you see HH:MM under each printed candle. Crosshair tooltip already shows the exact bar time on hover.

## Files

- new: `src/lib/gex.server.ts`
- new: `src/lib/gex.functions.ts`
- new: `src/lib/use-spx-gex.ts`
- edit: `src/lib/tradier.server.ts` (export a shared `tradierGet` helper to reuse auth/base URL)
- edit: `src/components/charts/EsChartPanel.tsx` (wire `useSpxGex`, swap source for SPX, header timestamp)
- edit: `src/components/charts/Charts.tsx` (time-scale `tickMarkFormatter` + spacing)
