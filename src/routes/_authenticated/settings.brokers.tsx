import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { z } from "zod";
import {
  getSchwabStatus,
  disconnectSchwab,
  exchangeSchwabCodeManual,
  type SchwabStatus,
} from "@/lib/schwab.functions";
import { supabase } from "@/integrations/supabase/client";

const searchSchema = z.object({
  connected: z.string().optional(),
  error: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/settings/brokers")({
  validateSearch: searchSchema,
  component: BrokersPage,
});

function BrokersPage() {
  const { connected, error } = useSearch({
    from: "/_authenticated/settings/brokers",
  });
  const fetchStatus = useServerFn(getSchwabStatus);
  
  const fetchDisconnect = useServerFn(disconnectSchwab);
  const fetchManualExchange = useServerFn(exchangeSchwabCodeManual);
  const [status, setStatus] = useState<SchwabStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [manualInput, setManualInput] = useState("");
  const [manualMsg, setManualMsg] = useState<
    { kind: "ok" | "err"; text: string } | null
  >(null);
  const [manualBusy, setManualBusy] = useState(false);

  async function manualExchange() {
    setManualBusy(true);
    setManualMsg(null);
    try {
      await fetchManualExchange({ data: { codeOrUrl: manualInput } });
      setManualMsg({ kind: "ok", text: "Schwab connected successfully." });
      setManualInput("");
      await refresh();
    } catch (e) {
      setManualMsg({
        kind: "err",
        text: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setManualBusy(false);
    }
  }

  async function refresh() {
    try {
      setStatus(await fetchStatus());
    } catch (e) {
      console.error(e);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function connect() {
    setBusy(true);
    try {
      const { url } = await fetchAuthUrl();
      // Lovable preview is iframed; Schwab sends X-Frame-Options: DENY, so
      // navigating the iframe shows "refused to connect". Break out to the
      // top window, or open a new tab if cross-origin blocks top access.
      try {
        if (window.top && window.top !== window.self) {
          window.top.location.href = url;
        } else {
          window.location.href = url;
        }
      } catch {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    } catch (e) {
      console.error(e);
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      await fetchDisconnect();
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.assign("/auth");
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="display text-2xl font-semibold">Brokers</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Connect your Schwab account to stream live SPX quotes and pull live
        option-chain GEX. Falls back to Tradier and then mock data automatically.
      </p>

      {connected === "schwab" && (
        <div className="mt-4 rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-500">
          Schwab connected successfully.
        </div>
      )}
      {error && (
        <div className="mt-4 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-500">
          Schwab connection failed: {error}
        </div>
      )}

      <div className="mt-6 rounded-md border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Charles Schwab</h2>
            <p className="text-xs text-muted-foreground">
              {status?.connected
                ? `Connected · refresh expires ${fmt(status.refreshExpiresAt)}`
                : "Not connected"}
            </p>
            {status?.connected && (
              <p className="text-xs text-muted-foreground">
                Access token refreshes automatically (current expiry{" "}
                {fmt(status.accessExpiresAt)}).
              </p>
            )}
          </div>
          <div className="flex gap-2">
            {status?.connected ? (
              <>
                <button
                  onClick={connect}
                  disabled={busy}
                  className="rounded border border-input bg-background px-3 py-1.5 text-xs font-medium"
                >
                  Reconnect
                </button>
                <button
                  onClick={disconnect}
                  disabled={busy}
                  className="rounded bg-red-500/90 px-3 py-1.5 text-xs font-medium text-white"
                >
                  Disconnect
                </button>
              </>
            ) : (
              <button
                onClick={connect}
                disabled={busy}
                className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
              >
                {busy ? "..." : "Connect Schwab"}
              </button>
            )}
          </div>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Schwab refresh tokens last 7 days &mdash; you'll need to reconnect once
          a week. Access tokens (30 min) auto-refresh. Opens in the top window
          or a new tab (Schwab blocks iframe embedding).
        </p>
      </div>

      <div className="mt-4 rounded-md border border-border bg-card p-4">
        <h2 className="text-base font-semibold">Paste callback URL manually</h2>
        <p className="mt-1 text-[11px] text-muted-foreground">
          If Schwab doesn't redirect you back into this app, sign in at Schwab
          and copy the full URL from your browser's address bar after approval
          (it will contain <code>?code=...</code>). Paste it below — or just
          the raw code — and we'll exchange it for tokens.
        </p>
        <textarea
          value={manualInput}
          onChange={(e) => setManualInput(e.target.value)}
          placeholder="https://127.0.0.1/?code=...  — or just the code"
          rows={3}
          className="mt-3 w-full rounded border border-input bg-background px-3 py-2 font-mono text-xs"
        />
        {manualMsg && (
          <p
            className={`mt-2 text-xs ${manualMsg.kind === "ok" ? "text-emerald-500" : "text-red-500"}`}
          >
            {manualMsg.text}
          </p>
        )}
        <button
          onClick={manualExchange}
          disabled={manualBusy || !manualInput.trim()}
          className="mt-3 rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          {manualBusy ? "Exchanging..." : "Exchange & save"}
        </button>
      </div>



      <button
        onClick={signOut}
        className="mt-6 text-xs text-muted-foreground hover:text-foreground"
      >
        Sign out
      </button>
    </div>
  );
}

function fmt(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}
