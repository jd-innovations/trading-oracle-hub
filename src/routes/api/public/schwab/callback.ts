import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/schwab/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const errParam = url.searchParams.get("error");
        if (errParam) {
          return redirectToSettings({ error: errParam });
        }
        if (!code || !state) {
          return redirectToSettings({ error: "missing_code" });
        }
        const {
          verifyOAuthState,
          exchangeAuthCode,
          persistTokens,
        } = await import("@/lib/schwab.server");
        const userId = verifyOAuthState(state);
        if (!userId) {
          return redirectToSettings({ error: "invalid_state" });
        }
        try {
          const tok = await exchangeAuthCode(code);
          await persistTokens(userId, tok);
          return redirectToSettings({ connected: "schwab" });
        } catch (e) {
          console.error("[schwab/callback]", e);
          return redirectToSettings({ error: "exchange_failed" });
        }
      },
    },
  },
});

function redirectToSettings(params: Record<string, string>): Response {
  const qs = new URLSearchParams(params).toString();
  return new Response(null, {
    status: 302,
    headers: { Location: `/settings/brokers?${qs}` },
  });
}
