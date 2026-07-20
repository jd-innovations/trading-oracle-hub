## Current state

- No Discord integration wired in this project. The only Discord code is UI text formatters + copy-to-clipboard in `src/routes/index.tsx` and `src/components/auto-trader/TradeCard.tsx`.
- No Discord connector exists in Lovable's connector catalog — Discord integrates via **incoming webhooks** (a URL per channel), which is exactly what GreatPaddles uses.
- GreatPaddles pattern: store a `DISCORD_*_WEBHOOK_URL` secret, then `POST` a `{ content }` JSON body to that URL from a server function. Fire-and-forget from the client. Zero OAuth, zero bot setup.

So we don't have a connection, but we don't need one — we just need to port the webhook pattern (adapted from Supabase Edge Functions to TanStack server functions, since this project is on the modern stack).

## Plan

### 1. Secrets (you provide the webhook URLs from Discord)

Create one webhook per channel in Discord (Server Settings → Integrations → Webhooks → New Webhook → Copy URL), then store as runtime secrets:

- `DISCORD_PLAN_WEBHOOK_URL` — Daily Plan channel
- `DISCORD_RESULTS_WEBHOOK_URL` — Session Results channel
- `DISCORD_TRADES_WEBHOOK_URL` — Auto-trader alerts (entry / scale-outs / stops / EXT1)

If you'd rather use one channel for everything, we use just `DISCORD_PLAN_WEBHOOK_URL` and skip the others.

### 2. Server function: `postToDiscord`

New file `src/lib/discord.functions.ts` — a `createServerFn({ method: "POST" })` that:

- Validates `{ channel: "plan" | "results" | "trades", content: string }` with Zod
- Reads the matching webhook URL from `process.env` inside `.handler()`
- `POST`s `{ content, allowed_mentions: { parse: ["everyone"] } }` to the webhook
- Surfaces the exact Discord status/body on failure (same pattern as GreatPaddles)
- Guarded by `requireSupabaseAuth` so only signed-in users can trigger posts

### 3. UI wiring

- `src/routes/index.tsx` Daily Plan panel: add **"Post to Discord"** button next to the existing "Copy" button; on click, send the already-formatted text via `postToDiscord({ channel: "plan" })`. Same for the Results block → `channel: "results"`.
- `src/components/auto-trader/TradeCard.tsx`: add **"Post to Discord"** button alongside the existing copy button, sending to `channel: "trades"`.
- Optional toggle (localStorage, default off): "Auto-post trade events" — when on, the auto-trader hook fires `postToDiscord` on each `entry_filled`, `scale_out`, `stop_moved`, `stop_hit`, `leg_closed`, `ext1_set` event with a preformatted line. Off by default so we don't spam the channel during testing.

### 4. What we're *not* doing

- No Discord bot, no OAuth, no slash commands, no reading messages — webhooks are one-way (app → Discord) which is all you asked for ("send alerts").
- No Supabase Edge Functions — this project is TanStack Start, so we use `createServerFn` (the modern-stack equivalent of what GreatPaddles does in `supabase/functions/discord-notify-*`).

### Technical notes

- Discord webhook payload cap is 2000 chars — the plan/result formatters already sit well under that; we truncate defensively.
- `@everyone` requires `allowed_mentions.parse` to include `"everyone"` or Discord silently strips the mention.
- Webhooks have no per-app rate limit config — Discord returns 429 with `retry_after` if you hammer them; we surface it and don't auto-retry.

## Question before I build

Do you want one channel or three (Plan / Results / Trades)? And should trade-event auto-posting default **off** (manual "Post" button only) or **on** (every entry/scale-out/stop event auto-fires)? One channel and auto post by default for every event and a toggle to turn off auto post 