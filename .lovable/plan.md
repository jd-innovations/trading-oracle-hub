## Wire SPX to Tradier (live brokerage, WebSocket streaming)

Replace the SPX mock feed with real Tradier data. ES stays on the generator. If the Tradier token is missing or the API fails, the chart silently falls back to the existing mock — no UI error.

### Credentials

Tradier is not a Lovable standard connector, so we'll store the brokerage token as a secret:
- `TRADIER_ACCESS_TOKEN` — live brokerage API token (server-only)
- Base URL hard-coded to `https://api.tradier.com` (live)

I'll request the secret via `add_secret` after you approve this plan. You'll get the token at Tradier dashboard → API Access → Production Token.

### Symbol

Tradier exposes SPX as `VIX`-style index symbol `$SPX.X` (commonly accepted as `SPX` on quote endpoints; we'll resolve at runtime — `markets/timesales` accepts `SPX`, streaming requires `$SPX.X`).

### Server side (TanStack `createServerFn` + server route)

**`src/lib/tradier.server.ts`** (server-only)
- `fetchSpxHistory({ minutes })` → calls `GET /v1/markets/timesales?symbol=SPX&interval=1min&session_filter=open&start=…&end=…`, returns OHLC bars. Tradier's smallest intraday interval is `1min`, so for the 2m chart we fetch 1m and resample server-side into 2m candles (`resampleBars(bars, 2)`). 5m/15m/30m use the same resampler. RTH only (`session_filter=open`) matches the existing RTH filter.
- `createTradierStreamSession()` → `POST /v1/markets/events/session` returns `{ stream: { sessionid, url } }`. Required before opening the WebSocket. Sessions expire after ~5 min of inactivity; refresh on demand.

**`src/lib/spx-feed.functions.ts`**
- `getSpxHistory = createServerFn({ method: "GET" }).inputValidator(z.object({ timeframe: z.enum(["1m","2m","5m","15m","30m"]), lookbackDays: z.number().int().min(1).max(60) })).handler(...)` — reads `TRADIER_ACCESS_TOKEN` inside the handler, calls `fetchSpxHistory`, resamples, returns `{ candles: Candle[] }`. On any error → returns `{ candles: [], error: "unavailable" }` so the client can fall back silently.
- `getSpxStreamSession = createServerFn({ method: "POST" }).handler(...)` — returns `{ sessionId, wsUrl }` for the browser to open the WebSocket directly. (The browser opens the WS itself; we don't proxy ticks through the server.)

### Client side

**`src/lib/use-spx-feed.ts`** (new hook)
1. On mount (and on `timeframe` change), call `getSpxHistory({ data: { timeframe, lookbackDays: 5 } })`.
   - If `candles.length > 0` → use them. Otherwise fall through to mock.
2. Call `getSpxStreamSession()` once; open `new WebSocket(wsUrl)`.
3. On open, send `{ symbols: ["$SPX.X"], sessionid, linebreak: true, filter: ["trade","quote"] }`.
4. Aggregate incoming `trade` messages into the in-memory tail bar matching the chart's `timeframe`. Update the last candle live; push a new candle when the bar boundary rolls.
5. Auto-reconnect with backoff on close/error. Refresh session via `getSpxStreamSession()` if WS rejects.
6. Returns `{ candles, isLive }`.

**`src/components/charts/EsChartPanel.tsx`**
- When `symbol === "SPX"`, swap the existing `spxCandles` mock source for `useSpxFeed({ timeframe }).candles`. If the hook returns `[]`, keep the existing mock generator output (silent fallback per your choice).
- Tiny `isLive` indicator next to the symbol label (small green dot) — purely informational, no error toasts.

### Resampling

`resampleBars(bars1m, factor)` groups N consecutive 1-minute bars into one: `open = first.open`, `close = last.close`, `high = max(highs)`, `low = min(lows)`. Bucket boundary is `Math.floor(time / (factor*60))`. Used both for the initial REST history and for the live WS tick aggregator.

### Out of scope

- ES (futures) — Tradier brokerage doesn't carry CME futures; stays on mock.
- Options chains, quotes panel, order entry — feed only.
- Tick-by-tick replay/persistence — purely live.
- No UI to swap providers later; the seam is `use-spx-feed.ts` if we add one.

### Risks / things to watch

- Tradier session sessions expire on idle — the hook handles refresh.
- Index streaming (`$SPX.X`) requires your brokerage account to be entitled to index data; if `trade` events never arrive we'll only see initial history (still better than mock). I'll log this server-side so you can spot it.
- Tradier rate limits: 60 req/min on `markets/*`. We only call history once per timeframe switch + one session create — well within limits.
