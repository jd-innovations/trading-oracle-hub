# Schwab API Integration

Add Schwab as the primary live data source for SPX, with Tradier as fallback and mock as final fallback. Covers OAuth, token storage, REST (quotes / 1m history / option chain), and the Streamer WebSocket.

## 1. Lovable Cloud (Supabase) — required

Enable Lovable Cloud so we can persist Schwab refresh tokens per user. Schwab refresh tokens last 7 days; access tokens last 30 minutes. Without DB storage, you'd re-auth on every page reload.

New table:

```sql
create table public.schwab_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  access_token text not null,
  refresh_token text not null,
  access_expires_at timestamptz not null,
  refresh_expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);
-- RLS: user can read/write only their own row; service_role full access.
```

Auth: email/password + Google sign-in (defaults). Single-user app for now, but the schema scales.

## 2. Secrets

Stored via `add_secret`:
- `SCHWAB_APP_KEY` — your Schwab App Key
- `SCHWAB_APP_SECRET` — your Schwab App Secret
- `SCHWAB_REDIRECT_URI` — must match what's registered at developer.schwab.com (e.g. `https://<your-project>.lovable.app/api/public/schwab/callback`)

## 3. OAuth flow

**`src/routes/api/public/schwab/callback.ts`** — server route. Schwab redirects here with `?code=...`. Handler:
1. Verify `state` param against a short-lived cookie (CSRF).
2. POST `https://api.schwabapi.com/v1/oauth/token` with `grant_type=authorization_code`, Basic auth = `base64(APP_KEY:APP_SECRET)`.
3. Upsert tokens into `schwab_tokens` for the signed-in user (`supabaseAdmin` after verifying the session cookie).
4. Redirect to `/settings/brokers?connected=schwab`.

**`src/routes/_authenticated/settings.brokers.tsx`** — "Connect Schwab" button → builds `https://api.schwabapi.com/v1/oauth/authorize?...` and `window.location.assign(...)`. Shows current connection status, expiry countdown, and a "Reconnect" button (needed every 7 days).

**`src/lib/schwab-auth.server.ts`** — `getSchwabAccessToken(userId)`:
- Read row, return `access_token` if `access_expires_at > now + 60s`.
- Else POST `grant_type=refresh_token` with current `refresh_token`, persist new tokens, return new access.
- If refresh token also expired → throw `SchwabReauthRequired` (UI shows a banner).

## 4. REST data layer

**`src/lib/schwab.server.ts`** — thin REST helpers, all take `accessToken`:
- `fetchSchwabQuote(token, symbols)` → `GET /marketdata/v1/quotes?symbols=$SPX.X`
- `fetchSchwabPriceHistory(token, symbol, days)` → `GET /marketdata/v1/pricehistory` with `frequencyType=minute&frequency=1`. Returns 1-minute candles for resampling.
- `fetchSchwabChain(token, symbol, fromDate, toDate)` → `GET /marketdata/v1/chains` with `includeUnderlyingQuote=true`. Returns Schwab's grouped call/put map with Greeks (delta, gamma, OI).

**`src/lib/spx-feed.functions.ts`** — refactor `getSpxHistory`:
1. Try Schwab (if user has tokens). Return on success.
2. Catch → try Tradier (existing path).
3. Catch → return `{ candles: [], error }` so client falls back to mock.

**`src/lib/gex.server.ts`** — add Schwab adapter: map Schwab chain → existing `computeGex()` input shape (strike, callOI, callGamma, putOI, putGamma). Same fallback chain.

## 5. Streaming

**`src/lib/spx-feed.functions.ts`** — `getSpxStreamSession`:
1. Schwab path: `GET /trader/v1/userPreference` (needs `Trader API` scope, included in Market Data approval since 2024) → returns `streamerInfo[0].streamerSocketUrl` + `schwabClientCustomerId` + `schwabClientCorrelId` + `schwabClientChannel` + `schwabClientFunctionId`. Return as a single session object.
2. Fallback: existing Tradier `createTradierMarketSession`.

**`src/lib/use-spx-feed.ts`** — extend the existing WebSocket hook to handle Schwab's message format:
- Connect → send `LOGIN` request (Schwab JSON-RPC-ish protocol with `requestid`, `service: ADMIN`, `command: LOGIN`, credentials from session).
- Subscribe → `service: LEVELONE_FUTURES_OPTIONS` for SPX (or `LEVELONE_EQUITIES` if you stream the index). Field set `0,1,2,3,8,38` covers symbol/bid/ask/last/volume/last-trade-time.
- Map incoming `data[].content[]` to the same `{price, date}` shape we already feed into the candle aggregator. No chart code changes.

Schwab streamer auto-disconnects after 30 min of access-token age — the hook will re-mint a session and reconnect on `close` with backoff (already in place).

## 6. UI changes

- Header `LIVE` badge gains a source label: `LIVE · Schwab` / `LIVE · Tradier` / `MOCK`.
- GEX chip row already shows `GEX LIVE`; add same source suffix.
- New `/settings/brokers` page (under `_authenticated/`) with Connect / Reconnect / Disconnect buttons + token expiry display.

## Files

**New**
- `src/lib/schwab.server.ts` — REST helpers
- `src/lib/schwab-auth.server.ts` — token get/refresh
- `src/lib/schwab-stream.server.ts` — `getSchwabStreamSession`
- `src/lib/schwab.functions.ts` — `connectSchwab`, `disconnectSchwab`, `getSchwabStatus`
- `src/routes/api/public/schwab/callback.ts` — OAuth callback
- `src/routes/_authenticated/settings.brokers.tsx` — Connect UI
- `src/routes/_authenticated/route.tsx` — managed auth gate (auto-created)
- supabase migration: `schwab_tokens` table + RLS + grants

**Edited**
- `src/lib/spx-feed.functions.ts` — Schwab-first, Tradier fallback
- `src/lib/gex.functions.ts` / `gex.server.ts` — Schwab chain adapter
- `src/lib/use-spx-feed.ts` — Schwab streamer protocol branch
- `src/components/charts/EsChartPanel.tsx` — source label in badges

## Out of scope (v1)
- Account/positions/orders (Trader API) — you didn't pick it; easy to add later.
- ES futures via Schwab (`/ES:XCME`) — ES stays on mock as requested.
- Automatic cron-based refresh — access token refreshes on demand, refresh token still requires manual reconnect weekly (Schwab hard limit).

## Risks
- Schwab Streamer protocol is undocumented JSON over WS; field IDs for `LEVELONE_FUTURES_OPTIONS` are stable but quirky. We'll log unknown message types behind a debug flag.
- `$SPX.X` symbol: Schwab uses `$SPX` for the index quote and `SPXW`/`SPX` roots for options. We'll normalize in `schwab.server.ts`.
- 7-day refresh token expiry is a Schwab platform limit — banner + email reminder are out of scope for v1.
