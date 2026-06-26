## Goal

The Schwab OAuth URL (`api.schwabapi.com/v1/oauth/authorize`) is currently redirecting you to `sws-gateway.schwab.com`, where your **developer-portal credentials don't work** — that's a retail Schwab brokerage login, not the developer login. You want Connect to send you to `https://developer.schwab.com/` (where your credentials *do* work), let you run OAuth from the portal's built-in tool, and then paste the resulting callback URL into the manual exchange box that already exists on `/settings/brokers`.

## Change (frontend only, one file)

**`src/routes/_authenticated/settings.brokers.tsx`**

1. Replace the `connect()` flow so it no longer calls `getSchwabAuthorizeUrl()` / `fetchAuthUrl()`. Instead, open `https://developer.schwab.com/` in a new tab:
   ```ts
   window.open("https://developer.schwab.com/", "_blank", "noopener,noreferrer");
   ```
   Remove the `fetchAuthUrl` import and the `busy` spinner state tied to it (keep `busy` only for Disconnect).

2. Relabel the button **"Open Schwab Developer Portal"** (Reconnect becomes "Open portal again").

3. Rewrite the helper text under the button to a 3-step recipe:
   - Sign in at developer.schwab.com with your developer credentials.
   - Open your app → use Schwab's OAuth tool to authorize; it lands on `developer.schwab.com/oauth2-redirect.html?code=...`.
   - Copy that full URL and paste it into **Paste callback URL manually** below, then click **Exchange & save**.

4. Promote the manual-paste card visually (it stays functionally identical — `exchangeSchwabCodeManual` already parses the URL and exchanges the code server-side). Add a one-line note: *"This is how you finish connecting."*

## Out of scope

- No backend changes. `buildAuthorizeUrl`, `/api/public/schwab/callback`, token exchange, refresh, and `exchangeSchwabCodeManual` all stay as-is.
- `SCHWAB_REDIRECT_URI` stays at `https://developer.schwab.com/oauth2-redirect.html` so the portal's OAuth tool keeps working.
- No new routes, no auth/middleware changes.

## Why not auto-redirect into Schwab OAuth anymore

Schwab's `api.schwabapi.com/v1/oauth/authorize` bounces to `sws-gateway.schwab.com` (retail brokerage login), which rejects developer-portal credentials. Until you have a Schwab **brokerage** account linked to the app, the only reliable path is: log into the developer portal → run OAuth there → paste the callback URL back here.
