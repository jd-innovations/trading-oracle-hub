import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell, Panel } from "@/components/layout/AppShell";
import { fmtSigned, fmtPrice } from "@/lib/format";
import { listJournal, type JournalEntry } from "@/lib/journal.functions";
import { pointValueFor } from "@/lib/symbols";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/journal")({
  head: () => ({
    meta: [
      { title: "Trade Journal — JD Trading Planner" },
      { name: "description", content: "Real ES / NQ trading activity: Auto-Trader legs and Daily Plan results." },
    ],
  }),
  component: JournalPage,
});

type Instrument = "All" | "ES" | "NQ";

function fmtDate(d: string): string {
  const [y, m, day] = d.split("-");
  return `${m}/${day}/${y}`;
}
function fmtTime(ts: string | null): string {
  if (!ts) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ts));
}

function tradePnlUsd(e: JournalEntry): number {
  const pts = Number(e.realized_points ?? 0);
  return pts * pointValueFor(e.symbol);
}

function JournalPage() {
  const [inst, setInst] = useState<Instrument>("All");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fetchJournal = useServerFn(listJournal);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setAuthed(!!data.session);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!authed) return;
    let cancelled = false;
    setBusy(true); setErr(null);
    (async () => {
      try {
        const r = await fetchJournal({
          data: {
            symbol: inst,
            from: from || undefined,
            to: to || undefined,
            limit: 200,
          },
        });
        if (!cancelled) setEntries(r.entries);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Failed to load journal.");
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [authed, inst, from, to, fetchJournal]);

  const rows = entries;
  const trades = useMemo(() => rows.filter((r) => r.kind === "trade"), [rows]);
  const wins = trades.filter((t) => t.phase === "closed_win").length;
  const totalUsd = trades.reduce((s, t) => s + tradePnlUsd(t), 0);
  const plans = rows.filter((r) => r.kind === "plan");
  const avgScore = plans.length && plans.some((p) => p.score != null)
    ? Math.round(plans.filter((p) => p.score != null).reduce((s, p) => s + (p.score ?? 0), 0) /
        plans.filter((p) => p.score != null).length)
    : null;

  if (authed === false) {
    return (
      <AppShell title="Journal" subtitle="Trade Log">
        <Panel title="Sign in required">
          <p className="text-sm text-muted-foreground">
            Sign in to view your real ES / NQ trading journal. Auto-Trader legs and Daily Plan results
            are logged automatically once you're authenticated.
          </p>
        </Panel>
      </AppShell>
    );
  }

  return (
    <AppShell title="Journal" subtitle="Trade Log">
      <Panel
        title="Filters"
        right={
          <div className="mono text-xs text-muted-foreground">
            {trades.length} trades · {wins}W ·{" "}
            <span className={totalUsd >= 0 ? "text-bull" : "text-bear"}>{fmtSigned(totalUsd)}</span>
            {avgScore != null && <span className="ml-2">· Avg score {avgScore}</span>}
          </div>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="label-xs mb-1 block">Instrument</label>
            <div className="flex rounded-md border border-border bg-surface-1 p-0.5">
              {(["All", "ES", "NQ"] as Instrument[]).map((i) => (
                <button
                  key={i}
                  onClick={() => setInst(i)}
                  className={`flex-1 rounded px-2 py-1 text-xs font-semibold ${
                    inst === i ? "bg-surface-2 text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {i}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label-xs mb-1 block">From</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="mono w-full rounded-md border border-border bg-surface-1 px-2 py-1.5 text-xs"
            />
          </div>
          <div>
            <label className="label-xs mb-1 block">To</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="mono w-full rounded-md border border-border bg-surface-1 px-2 py-1.5 text-xs"
            />
          </div>
        </div>
        {err && <p className="mt-2 text-xs text-bear">{err}</p>}
      </Panel>

      {/* Mobile: card list */}
      <div className="mt-3 space-y-2 md:hidden">
        {rows.map((r) => (
          <JournalCard key={r.id} e={r} />
        ))}
        {rows.length === 0 && (
          <div className="rounded-lg border border-border bg-card px-3 py-8 text-center text-sm text-muted-foreground">
            {busy ? "Loading…" : "No trades or plans logged yet. Run the Auto-Trader or generate a Daily Plan to start filling the journal."}
          </div>
        )}
      </div>

      {/* Desktop / tablet: table */}
      <div className="mt-3 hidden overflow-hidden rounded-lg border border-border bg-card md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-1 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-semibold">Date</th>
                <th className="px-3 py-2 font-semibold">Sym</th>
                <th className="px-3 py-2 font-semibold">Type</th>
                <th className="px-3 py-2 font-semibold">Detail</th>
                <th className="px-3 py-2 text-right font-semibold">Pts</th>
                <th className="px-3 py-2 text-right font-semibold">P&amp;L</th>
                <th className="px-3 py-2 text-right font-semibold">Score</th>
                <th className="px-3 py-2 font-semibold">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <JournalRow key={r.id} e={r} />
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-sm text-muted-foreground">
                    {busy ? "Loading…" : "No trades or plans logged yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}

function SymbolChip({ s }: { s: string }) {
  return (
    <span
      className={`rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
        s === "ES"
          ? "border-info/30 bg-info/10 text-info"
          : "border-pivot/30 bg-pivot/10 text-pivot"
      }`}
    >
      {s}
    </span>
  );
}

function SideBadge({ side, phase }: { side: "long" | "short"; phase: string | null }) {
  const color = phase === "closed_win" ? "text-bull" : phase === "stopped" ? "text-bear" : "text-muted-foreground";
  return (
    <span className={`text-xs font-semibold uppercase ${color}`}>
      {side}
      {phase === "closed_win" ? " · WIN" : phase === "stopped" ? " · LOSS" : ""}
    </span>
  );
}

/** Peak favorable / worst adverse move per contract while the trade was open. */
function Excursion({ e, className = "" }: { e: JournalEntry; className?: string }) {
  if (e.mfe_points == null && e.mae_points == null) return null;
  return (
    <span className={`mono text-xs text-muted-foreground ${className}`}>
      peak <span className="text-bull">+{Number(e.mfe_points ?? 0).toFixed(2)}</span>
      {" / worst "}
      <span className="text-bear">{Number(e.mae_points ?? 0).toFixed(2)}</span>
      <span className="ml-1">pts/contract</span>
    </span>
  );
}

function JournalRow({ e }: { e: JournalEntry }) {
  if (e.kind === "trade") {
    const pnl = tradePnlUsd(e);
    return (
      <tr className="hover:bg-surface-1/60">
        <td className="mono whitespace-nowrap px-3 py-2 text-xs">{fmtDate(e.plan_date)}</td>
        <td className="px-3 py-2"><SymbolChip s={e.symbol} /></td>
        <td className="px-3 py-2 text-xs">
          <SideBadge side={(e.side ?? "long") as "long" | "short"} phase={e.phase} />
        </td>
        <td className="mono px-3 py-2 text-xs">
          {e.entry_label} @ {e.entry_price != null ? fmtPrice(Number(e.entry_price)) : "—"}
          {" → "}
          {e.exit_label ?? "exit"} @ {e.exit_price != null ? fmtPrice(Number(e.exit_price)) : "—"}
          <span className="ml-2 text-muted-foreground">
            {fmtTime(e.entry_time)}–{fmtTime(e.exit_time)}
          </span>
          <Excursion e={e} className="ml-2" />
        </td>
        <td className={`mono px-3 py-2 text-right text-xs font-semibold ${Number(e.realized_points ?? 0) >= 0 ? "text-bull" : "text-bear"}`}>
          {fmtSigned(Number(e.realized_points ?? 0))}
        </td>
        <td className={`mono px-3 py-2 text-right text-xs font-semibold ${pnl >= 0 ? "text-bull" : "text-bear"}`}>
          {fmtSigned(pnl)}
        </td>
        <td className="mono px-3 py-2 text-right text-xs text-muted-foreground">—</td>
        <td className="max-w-[260px] truncate px-3 py-2 text-xs text-muted-foreground">
          {e.contracts ? `${e.contracts}x · ` : ""}{e.notes ?? ""}
        </td>
      </tr>
    );
  }
  // plan row
  return (
    <tr className="hover:bg-surface-1/60">
      <td className="mono whitespace-nowrap px-3 py-2 text-xs">{fmtDate(e.plan_date)}</td>
      <td className="px-3 py-2"><SymbolChip s={e.symbol} /></td>
      <td className="px-3 py-2 text-xs font-semibold text-info uppercase">Plan</td>
      <td className="px-3 py-2 text-xs">
        Daily Plan — <span className={
          e.bias === "Bullish" ? "text-bull" : e.bias === "Bearish" ? "text-bear" : "text-info"
        }>{e.bias}</span>
        {e.session_high != null && e.session_low != null && e.session_close != null && (
          <span className="mono ml-2 text-muted-foreground">
            H {fmtPrice(Number(e.session_high))} / L {fmtPrice(Number(e.session_low))} / C {fmtPrice(Number(e.session_close))}
          </span>
        )}
      </td>
      <td className="mono px-3 py-2 text-right text-xs text-muted-foreground">—</td>
      <td className="mono px-3 py-2 text-right text-xs text-muted-foreground">—</td>
      <td className="mono px-3 py-2 text-right text-xs">
        {e.score != null ? `${e.score}/100` : "—"}
      </td>
      <td className="max-w-[260px] truncate px-3 py-2 text-xs text-muted-foreground">{e.notes ?? ""}</td>
    </tr>
  );
}

function JournalCard({ e }: { e: JournalEntry }) {
  if (e.kind === "trade") {
    const pnl = tradePnlUsd(e);
    return (
      <div className="rounded-lg border border-border bg-card p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="mono text-xs text-muted-foreground">{fmtDate(e.plan_date)}</span>
            <SymbolChip s={e.symbol} />
            <SideBadge side={(e.side ?? "long") as "long" | "short"} phase={e.phase} />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className={`mono text-xs font-semibold ${Number(e.realized_points ?? 0) >= 0 ? "text-bull" : "text-bear"}`}>
              {fmtSigned(Number(e.realized_points ?? 0))} pts
            </span>
            <span className={`mono text-xs font-semibold ${pnl >= 0 ? "text-bull" : "text-bear"}`}>
              {fmtSigned(pnl)}
            </span>
          </div>
        </div>
        <div className="mono mt-1.5 text-xs text-foreground">
          {e.entry_label} @ {e.entry_price != null ? fmtPrice(Number(e.entry_price)) : "—"}
          {" → "}
          {e.exit_label ?? "exit"} @ {e.exit_price != null ? fmtPrice(Number(e.exit_price)) : "—"}
        </div>
        <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>{fmtTime(e.entry_time)} – {fmtTime(e.exit_time)} ET</span>
          <span>{e.contracts ? `${e.contracts}x` : ""}</span>
        </div>
        <Excursion e={e} className="mt-1 block" />
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="mono text-xs text-muted-foreground">{fmtDate(e.plan_date)}</span>
          <SymbolChip s={e.symbol} />
          <span className="text-[10px] font-semibold uppercase text-info">Plan</span>
        </div>
        <span className="mono text-xs text-muted-foreground">
          {e.score != null ? `${e.score}/100` : "—"}
        </span>
      </div>
      <div className="mt-1.5 text-sm">
        Daily Plan —{" "}
        <span className={
          e.bias === "Bullish" ? "text-bull" : e.bias === "Bearish" ? "text-bear" : "text-info"
        }>
          {e.bias}
        </span>
      </div>
      {e.session_high != null && e.session_low != null && e.session_close != null && (
        <div className="mono mt-1 text-xs text-muted-foreground">
          H {fmtPrice(Number(e.session_high))} / L {fmtPrice(Number(e.session_low))} / C {fmtPrice(Number(e.session_close))}
        </div>
      )}
      {e.notes && <div className="mt-1 truncate text-xs text-muted-foreground">{e.notes}</div>}
    </div>
  );
}
