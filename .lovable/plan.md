## Problem

`sws-gateway.schwab.com refused to connect` happens because the Lovable preview runs inside an iframe and the **Connect Schwab** button calls `window.location.assign(url)`, which tries to load Schwab's OAuth page inside that same iframe. Schwab sends `X-Frame-Options: DENY` / a strict CSP, so the browser blocks the navigation and you see the "refused to connect" page.

## Fix

Open Schwab's authorize URL in the **top-level window**, not the iframe.

### Change in `src/routes/_authenticated/settings.brokers.tsx`

In `connect()`, replace:

```ts
window.location.assign(url);
```

with a top-window navigation that also falls back to a new tab if we're sandboxed and can't reach `window.top`:

```ts
try {
  if (window.top && window.top !== window.self) {
    window.top.location.href = url;
  } else {
    window.location.href = url;
  }
} catch {
  // Cross-origin frame blocks top access — open in a new tab instead.
  window.open(url, "_blank", "noopener,noreferrer");
}
```

Also update the helper text under the Connect button to mention: "Opens in a new tab if the preview is embedded." So you're not surprised when it pops out.

## Out of scope

- No backend changes. OAuth URL builder, token exchange, callback route, and manual-paste fallback stay as-is.
- `SCHWAB_REDIRECT_URI` is unchanged. If you've left it pointed at `https://developer.schwab.com/oauth2-redirect.html`, keep using the **Paste callback URL manually** card after approval — that flow already works once the Schwab page actually loads.
