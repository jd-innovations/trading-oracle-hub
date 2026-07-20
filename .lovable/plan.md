## Problem

Manual `Test` and `Post` buttons deliver to Discord fine, so the webhook + server fn are working. But when the auto-trader emits toasts (entry / scale / stop / target), `sendToDiscord(...)` is called with `{ silent: true }` and nothing arrives — and because it's silent, a failure toast is the only feedback we'd see, and you're not seeing one either.

That leaves three plausible causes:

1. `sendToDiscord` never actually runs from inside the hook (e.g. `loadAutoPostTrades()` reads `"0"`, or the "new events" are from a rehydrated state so `newEvents.length === 0`, or the toasts you're seeing are stale from a prior mount).
2. The call runs, the server fn returns 2xx from a stale/other webhook, and the message goes to a Discord channel you're not watching.
3. The call runs, Discord rate-limits or 400s the payload, and the error toast is swallowed by `silent: true` being misapplied.

We need signal before more code changes.

## Plan

### 1. Add diagnostic instrumentation (temporary, easy to remove)

- `src/lib/discord-client.ts`
  - Change `sendToDiscord` so `silent` only suppresses the **success** toast — **errors always toast** (they should today, verify).
  - Add a `console.info("[discord] post →", label, contentPreview)` before the fetch, and `console.info("[discord] ok", label)` / `console.error("[discord] fail", label, err)` after.
- `src/lib/discord.functions.ts`
  - `console.log` the outbound length + first 80 chars server-side so `server-function-logs` shows whether the handler was reached.
- `src/lib/auto-trader/use-auto-trader.ts`
  - Log `[auto-trader] event autoPost=<bool> kind=<kind>` on every event, so we can confirm the branch is entered.

### 2. Add a "Test event" button on the Auto-Trader card

A one-click path that reuses the exact same code that live events use (`sendToDiscord(line, { silent: true })` with a synthetic entry note) — proves the auto-trader → Discord bridge, independent of price action. If this works but real events don't, cause is (1). If this also silently fails, cause is (2) or (3) and we'll have server logs to confirm.

### 3. Make auto-posts non-silent by default until this is resolved

Flip `sendToDiscord` calls inside the hook to `silent: false` so every successful post also toasts "Posted to Discord · Auto-trader". You'll immediately see whether posts are happening and just not landing in your channel, vs. not being sent at all.

### 4. Guard against stale rehydration

In `useAutoTrader`, mark all events present at hydrate time as "already posted" so a page refresh doesn't re-send old events; conversely, if a bar arrives that adds new events, we know for sure those are fresh and should post.

### 5. Report + fix

After you reload and let one event fire (or click the new Test-event button):
- If the toast says "Posted to Discord · Auto-trader" but the channel is empty → the `DISCORD_WEBHOOK_URL` secret points at a different channel/server than the manual Post button hits. We'll surface the webhook host in a server log so we can verify, and (if needed) prompt you via `update_secret` to repoint it.
- If the toast says "Discord post failed: …" → the server log will show Discord's response body; typical culprits are 400 (empty content after trim), 401 (revoked webhook), or 429 (rate limit). Fix accordingly (payload trim, secret update, or add a small in-hook throttle/queue).
- If no toast appears at all → the code path isn't running; the console log will name which guard short-circuited (`autoPost=false`, no new events, or hook disabled) and we adjust the guard.

## Technical notes

- No schema, secrets, or routing changes in step 1–4 — this is purely client + one server-side log line.
- Removal plan: after confirming behavior, revert the `console.info` lines and set the hook back to `silent: true` for auto-posts (keeping error toasts).
- Files touched: `src/lib/discord-client.ts`, `src/lib/discord.functions.ts`, `src/lib/auto-trader/use-auto-trader.ts`, `src/components/auto-trader/TradeCard.tsx` (Test-event button).