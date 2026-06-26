## Problem

Your working app authorizes against `https://api.schwabapi.com/v1/oauth/authorize` with **PKCE** (`code_challenge` / `code_challenge_method=S256`) and `redirect_uri=https://developer.schwab.com/oauth2-redirect.html`. Our app currently doesn't generate the authorize URL at all — we send users to the bare developer portal, they authorize via Schwab's Swagger tool (which mints its own PKCE pair and its own redirect), then we try to exchange that code with our own `SCHWAB_REDIRECT_URI` and no `code_verifier`. Schwab rejects with `invalid_grant: RedirectURI does not match the redirection URI used in the authorization request` — which is exactly what the last network log shows.

The fix is to make **our app** be the one that starts the authorize call, with our own PKCE pair, so the token exchange has a matching `redirect_uri` + `code_verifier`.

## Plan

1. **Schema** — add a `schwab_oauth_state` table (`user_id` PK, `code_verifier`, `state`, `redirect_uri`, `created_at`) with RLS + grants. Stores one pending PKCE attempt per user.

2. **`src/lib/schwab.server.ts`**
   - `buildAuthorizeUrl(userId)` — generates `code_verifier` (43–128 char URL-safe), derives S256 `code_challenge`, random `state`, persists `(verifier, state, redirect_uri)` into `schwab_oauth_state`, returns full URL:
     `https://api.schwabapi.com/v1/oauth/authorize?response_type=code&client_id=…&redirect_uri=…&scope=readonly&state=…&code_challenge=…&code_challenge_method=S256`.
   - `exchangeAuthCode(userId, code, stateFromCallback)` — loads stored row, verifies `state`, posts `grant_type=authorization_code` with the **same** `redirect_uri` and the stored `code_verifier`, deletes the row.
   - Keep the existing token persistence / refresh code unchanged.

3. **`src/lib/schwab.functions.ts`**
   - `startSchwabAuth` (auth'd) → returns `{ url }`.
   - Rework `exchangeSchwabCodeManual` to accept a pasted callback URL or raw code, extract `code` + `state`, and call the new `exchangeAuthCode(userId, code, state)`.
   - Keep the token-JSON paste path as a separate fallback (`pasteSchwabTokens`) for cases where the user only has tokens, not a code.

4. **`src/routes/_authenticated/settings.brokers.tsx`**
   - Primary CTA: **"Authorize with Schwab"** — calls `startSchwabAuth` and `window.open(url, "_blank")`. Shows the redirect URI being used so the user can confirm it matches their Schwab app registration.
   - Paste box stays, but the helper text now says "paste the `developer.schwab.com/oauth2-redirect.html?code=…&state=…` URL you land on after authorizing." Drop the Swagger-tool guidance since it's no longer needed.
   - Keep token-JSON fallback in a collapsed "Advanced" section.

5. **Secrets** — confirm `SCHWAB_APP_KEY`, `SCHWAB_APP_SECRET`, `SCHWAB_REDIRECT_URI` are set. `SCHWAB_REDIRECT_URI` must exactly match what's registered on your Schwab app (e.g. `https://developer.schwab.com/oauth2-redirect.html`, or your own callback). I'll prompt for any missing ones during build.

### Technical notes
- PKCE verifier: 64 random bytes → base64url, no padding. Challenge: `base64url(sha256(verifier))`. Done with Web Crypto (Worker-safe).
- We still send HTTP Basic auth (`client_id:client_secret`) on the token endpoint — Schwab requires both Basic + `code_verifier` for confidential clients.
- No changes to chart/data code; this is purely the auth handshake.

### Out of scope
- Building an automated `/api/schwab/callback` route that captures the code without copy-paste. Possible follow-up once the manual flow works end-to-end.
