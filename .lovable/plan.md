## Plan

1. **Broker settings page**
   - Keep the Schwab button as a plain external link to `https://developer.schwab.com/` only.
   - Rename/copy-adjust the UI so it clearly says this app does **not** open the Schwab brokerage authorization login.
   - Make the manual paste box the primary action for connecting.

2. **Remove hidden authorization entry points**
   - Search for any remaining Schwab OAuth/authorization launch code that could send you to `sws-gateway.schwab.com` or Schwab’s authorize flow.
   - Remove or neutralize those UI calls so no in-app click can start the brokerage-login flow.

3. **Improve manual token parsing feedback**
   - Accept either the full `developer.schwab.com/oauth2-redirect.html?code=...` URL or the raw `code`.
   - If the pasted value is not usable, show a direct message telling you to paste the callback URL/code from the developer portal OAuth tool.

4. **Verify**
   - Confirm the broker page contains only `https://developer.schwab.com/` as the external Schwab navigation target and no `sws-gateway` or auto-authorize link remains.