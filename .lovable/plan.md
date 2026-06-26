## Plan

1. Update the Brokers page Schwab action so it is a plain external link to `https://developer.schwab.com/`, not a JavaScript OAuth/authorization launcher.

2. Remove any remaining UI path that can send you directly to Schwab authorization from this page, including “Open portal again” button behavior.

3. Keep the manual paste fallback intact:
   - You log in at the Schwab developer site.
   - You use Schwab’s developer OAuth tool.
   - You copy the resulting `oauth2-redirect.html?code=...` URL.
   - You paste it into the app to exchange and save the token.

4. Clean up unused authorization URL client/server function exports if they are no longer referenced, so the app does not maintain a confusing direct-auth flow.

## Technical notes

- The live UI currently has a `connect()` function that opens `https://developer.schwab.com/`, but I’ll convert the rendered buttons to direct `<a>` links with `target="_blank"`, `rel="noopener noreferrer"`, and `referrerPolicy="no-referrer"` to avoid iframe/popup authorization behavior.
- I’ll leave token exchange, saved connection status, disconnect, and live-data hooks unchanged.