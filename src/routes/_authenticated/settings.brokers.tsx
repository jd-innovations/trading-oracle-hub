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
        text:
          e instanceof Error
            ? e.message
            : "Paste the developer.schwab.com callback URL or raw code.",
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
        Connect Schwab data by pasting a developer portal callback URL, OAuth
        code, or token JSON here. This app will not open the Schwab brokerage login.
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
                <a
                  href="https://developer.schwab.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  referrerPolicy="no-referrer"
                  className="rounded border border-input bg-background px-3 py-1.5 text-xs font-medium"
                >
                Open developer portal
                </a>
                <button
                  onClick={disconnect}
                  disabled={busy}
                  className="rounded bg-red-500/90 px-3 py-1.5 text-xs font-medium text-white"
                >
                  Disconnect
                </button>
              </>
            ) : (
              <a
                href="https://developer.schwab.com/"
                target="_blank"
                rel="noopener noreferrer"
                referrerPolicy="no-referrer"
                className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
              >
                Open Schwab Developer Portal
              </a>
            )}
          </div>
        </div>
        <ol className="mt-3 list-decimal space-y-1 pl-4 text-[11px] text-muted-foreground">
          <li>Sign in at developer.schwab.com with your developer credentials.</li>
          <li>
            If you see <strong>Available authorizations</strong> / <strong>Authorized</strong>,
            that only means Schwab authorized its Swagger tool. It is not connected here.
          </li>
          <li>
            Paste either <code>developer.schwab.com/oauth2-redirect.html?code=...</code>,
            the raw code, or token JSON containing <code>access_token</code> below.
          </li>
        </ol>
        <p className="mt-2 rounded border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-[11px] text-red-400">
          Do not paste or use <code>sws-gateway.schwab.com</code>; that is the
          brokerage login flow, not the developer token callback.
        </p>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Refresh tokens last 7 days; access tokens (30 min) auto-refresh.
        </p>
      </div>

      <div className="mt-4 rounded-md border-2 border-primary/50 bg-card p-4">
        <h2 className="text-base font-semibold">Paste credentials manually</h2>
        <p className="mt-1 text-[11px] text-primary">
          This is the only connection path used by this app.
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Paste the full developer portal callback URL containing{" "}
          <code>?code=...</code>, paste only the raw code, or paste token JSON like{" "}
          <code>{`{"access_token":"...","refresh_token":"...","expires_in":1800}`}</code>.
          The authorization URL shown inside Schwab's Swagger modal is not enough.
        </p>
        <textarea
          value={manualInput}
          onChange={(e) => setManualInput(e.target.value)}
          placeholder='https://developer.schwab.com/oauth2-redirect.html?code=...  — or token JSON with access_token / refresh_token'
          rows={5}
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
          {manualBusy ? "Saving..." : "Save / exchange credentials"}
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
