## Goal
Add a manual fallback for connecting Schwab in case the OAuth auto-redirect to `/api/public/schwab/callback` doesn't land back in the app (common with iframe previews / Schwab's URL rewriting). You'll be able to paste the full callback URL (or just the `code` parameter) and we'll exchange it for tokens server-side.

## Changes

### 1. New server function — `exchangeSchwabCodeManual`
File: `src/lib/schwab.functions.ts`
- Auth-gated (`requireSupabaseAuth`).
- Input: `{ codeOrUrl: string }` validated with Zod (trim, max 4000 chars).
- Parses input: if it looks like a URL, extract `?code=` (and `state` if present); otherwise treat as raw code.
- Calls `exchangeAuthCode(code)` and `persistTokens(userId, tok)` from `schwab.server.ts` — no state verification required for the manual path since the user is already authenticated via Supabase.
- Returns `{ ok: true }` or throws with a clean message on Schwab token-endpoint failure.

### 2. Manual paste UI on Brokers page
File: `src/routes/_authenticated/settings.brokers.tsx`
- Below the existing "Connect Schwab" card, add a collapsible "Paste callback URL manually" section.
- Textarea + "Exchange & save" button wired to the new server fn.
- Show success/error inline; on success, call `refresh()` to update connection status.
- Brief helper text: "After signing in at Schwab, copy the full URL from your browser's address bar (it will start with `https://...?code=...`) and paste it here."

### 3. (No DB / schema changes, no new secrets.)

## Out of scope
- No change to the existing auto-redirect callback route — it stays as the primary path.
- No change to the Schwab OAuth URL builder or token refresh logic.

## Technical notes
- Manual path safely skips `verifyOAuthState` because the user is authenticated by Supabase at the moment of paste, so we know which `user_id` to bind the tokens to.
- Code extraction handles both `https://.../callback?code=ABC&state=...` and raw `ABC` formats; URL-decode the code before sending to Schwab.
