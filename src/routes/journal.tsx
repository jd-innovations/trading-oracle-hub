import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell, Panel } from "@/components/layout/AppShell";
import { journal } from "@/lib/mock/data";
import { fmtSigned } from "@/lib/format";

export const Route = createFileRoute("/journal")({
  head: () => ({
    meta: [
      { title: "Trade Journal — JD Trading Planner" },
      { name: "description", content: "Filterable journal of ES daily plans and SPX iron fly trades." },
    ],
  }),
  component: JournalPage,
});

type Instrument = "All" | "ES" | "SPX";

function JournalPage() {
  const [inst, setInst] = useState<Instrument>("All");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const rows = useMemo(() => {
    return journal.filter((j) => {
      if (inst !== "All" && j.instrument !== inst) return false;
      if (from) {
        const d = new Date(j.date);
        if (d < new Date(from)) return false;
      }
      if (to) {
        const d = new Date(j.date);
        if (d > new Date(to)) return false;
      }
      return true;
    });
  }, [inst, from, to]);

  const total = rows.reduce((s, r) => s + r.pnl, 0);
  const wins = rows.filter((r) => r.result === "Win").length;

  return (
    <AppShell title="Journal" subtitle="Trade Log">
      <Panel
        title="Filters"
        right={
          <div className="mono text-xs text-muted-foreground">
            {rows.length} trades · {wins}W · <span className={total >= 0 ? "text-bull" : "text-bear"}>{fmtSigned(total)}</span>
          </div>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="label-xs mb-1 block">Instrument</label>
            <div className="flex rounded-md border border-border bg-surface-1 p-0.5">
              {(["All", "ES", "SPX"] as Instrument[]).map((i) => (
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
      </Panel>

      {/* Mobile: card list */}
      <div className="mt-3 space-y-2 md:hidden">
        {rows.map((r) => (
          <div key={r.id} className="rounded-lg border border-border bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="mono text-xs text-muted-foreground">{r.date}</span>
                <span className={`rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                  r.instrument === "ES" ? "border-info/30 bg-info/10 text-info" : "border-pivot/30 bg-pivot/10 text-pivot"
                }`}>{r.instrument}</span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={`text-xs font-semibold ${
                  r.result === "Win" ? "text-bull" : r.result === "Loss" ? "text-bear" : "text-muted-foreground"
                }`}>{r.result}</span>
                <span className={`mono text-xs font-semibold ${r.pnl >= 0 ? "text-bull" : "text-bear"}`}>{fmtSigned(r.pnl)}</span>
              </div>
            </div>
            <div className="mt-1.5 text-sm text-foreground">{r.setup}</div>
            <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>Bias: {r.bias ?? "—"}</span>
              <span className="mono">Score {r.score ?? "—"}</span>
            </div>
            {r.notes && <div className="mt-1 truncate text-xs text-muted-foreground">{r.notes}</div>}
          </div>
        ))}
        {rows.length === 0 && (
          <div className="rounded-lg border border-border bg-card px-3 py-8 text-center text-sm text-muted-foreground">No trades match.</div>
        )}
      </div>

      {/* Desktop / tablet: table */}
      <div className="mt-3 hidden overflow-hidden rounded-lg border border-border bg-card md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-1 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-semibold">Date</th>
                <th className="px-3 py-2 font-semibold">Inst</th>
                <th className="px-3 py-2 font-semibold">Setup</th>
                <th className="px-3 py-2 font-semibold">Bias</th>
                <th className="px-3 py-2 font-semibold">Result</th>
                <th className="px-3 py-2 text-right font-semibold">P&amp;L</th>
                <th className="px-3 py-2 text-right font-semibold">Score</th>
                <th className="px-3 py-2 font-semibold">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-surface-1/60">
                  <td className="mono whitespace-nowrap px-3 py-2 text-xs">{r.date}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                      r.instrument === "ES" ? "border-info/30 bg-info/10 text-info" : "border-pivot/30 bg-pivot/10 text-pivot"
                    }`}>{r.instrument}</span>
                  </td>
                  <td className="px-3 py-2 text-xs">{r.setup}</td>
                  <td className="px-3 py-2 text-xs">{r.bias ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span className={`text-xs font-semibold ${
                      r.result === "Win" ? "text-bull" : r.result === "Loss" ? "text-bear" : "text-muted-foreground"
                    }`}>{r.result}</span>
                  </td>
                  <td className={`mono px-3 py-2 text-right text-xs font-semibold ${r.pnl >= 0 ? "text-bull" : "text-bear"}`}>
                    {fmtSigned(r.pnl)}
                  </td>
                  <td className="mono px-3 py-2 text-right text-xs text-muted-foreground">{r.score ?? "—"}</td>
                  <td className="max-w-[260px] truncate px-3 py-2 text-xs text-muted-foreground">{r.notes}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-sm text-muted-foreground">No trades match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
