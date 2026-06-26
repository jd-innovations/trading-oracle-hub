import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/schwab/callback")({
  server: {
    handlers: {
      GET: async () => redirectToSettings({ error: "manual_paste_required" }),
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
