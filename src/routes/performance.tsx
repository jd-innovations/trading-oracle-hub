import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell, Panel } from "@/components/layout/AppShell";
import { EquityChart } from "@/components/charts/Charts";
import { listPerfTrades, type PerfTrade } from "@/lib/performance.functions";
import { pointValueFor } from "@/lib/symbols";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/performance")({
  head: () => ({
    meta: [
      { title: "Performance — JD Trading Planner" },
      {
        name: "description",
        content: "Auto-Trader results: win rate, net points, net P&L, profit factor, drawdown, and equity curve.",
      },
      { property: "og:title", content: "Performance — JD Trading Planner" },
      {
        property: "og:description",
        content: "Real ES and NQ Auto-Trader performance across rolling windows.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PerfPage,
});

type WindowKey = "L5" | "L10" | "L20" | "All";
type Instrument = "All" | "ES" | "NQ";

function usd(n: number): string {
  const s = n < 0 ? "-" : "+";
  return `${s}$${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}
function pts(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}`;
}
function fmtDate(d: string): string {
  const [y, m, day] = d.split("-");
  return `${m}/${day}/${y}`;
}

interface Stats {
  n: number;
  wins: number;
  losses: number;
  winPct: number;
  netPts: number;
  netUsd: number;
  avgPts: number;
  avgWinUsd: number;
  avgLossUsd: number;
  profitFactor: number | null;
  maxDdUsd: number;
  best: number;
  worst: number;
}

function tradeUsd(t: PerfTrade): number {
  return Number(t.realized_points ?? 0) * pointValueFor(t.symbol);
}

function computeStats(trades: PerfTrade[]): Stats {
  const n = trades.length;
  const wins = trades.filter((t) => t.phase === "closed_win");
  const losses = trades.filter((t) => t.phase !== "closed_win");
  const usdVals = trades.map(tradeUsd);
  const netUsd = usdVals.reduce((a, b) => a + b, 0);
  const netPts = trades.reduce((a, t) => a + Number(t.realized_points ?? 0), 0);
  const grossWin = usdVals.filter((v) => v > 0).reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(usdVals.filter((v) => v < 0).reduce((a, b) => a + b, 0));

  let equity = 0;
  let peak = 0;
  let maxDd = 0;
  for (const v of usdVals) {
    equity += v;
    peak = Math.max(peak, equity);
    maxDd = Math.max(maxDd, peak - equity);
  }

  return {
    n,
    wins: wins.length,
    losses: losses.length,
    winPct: n ? (wins.length / n) * 100 : 0,
    netPts,
    netUsd,
    avgPts: n ? netPts / n : 0,
    avgWinUsd: wins.length ? grossWin / wins.length : 0,
    avgLossUsd: losses.length ? -grossLoss / losses.length : 0,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : null,
    maxDdUsd: maxDd,
    best: n ? Math.max(...usdVals) : 0,
    worst: n ? Math.min(...usdVals) : 0,
  };
}

interface Excursions {
  tracked: number;
  untracked: number;
  everGreen: number;
  avgPeak: number;
  avgPeakWhenGreen: number;
  beyondRisk: number;
  medianPeak: number;
}

/** How far losing trades ran in your favor before they turned. */
function computeExcursions(trades: PerfTrade[]): Excursions {
  const losers = trades.filter((t) => t.phase !== "closed_win");
  const tracked = losers.filter((t) => t.mfe_points != null);
  const peaks = tracked.map((t) => Number(t.mfe_points ?? 0));
  const green = peaks.filter((p) => p > 0);
  const beyondRisk = tracked.filter((t) => {
    const risk = Math.abs(Number(t.entry_price ?? 0) - Number(t.exit_price ?? 0));
    return risk > 0 && Number(t.mfe_points ?? 0) >= risk;
  }).length;
  const sorted = [...peaks].sort((a, b) => a - b);
  return {
    tracked: tracked.length,
    untracked: losers.length - tracked.length,
    everGreen: green.length,
    avgPeak: peaks.length ? peaks.reduce((a, b) => a + b, 0) / peaks.length : 0,
    avgPeakWhenGreen: green.length ? green.reduce((a, b) => a + b, 0) / green.length : 0,
    beyondRisk,
    medianPeak: sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0,
  };
}

function PerfPage() {
  const [windowKey, setWindowKey] = useState<WindowKey>("All");
  const [inst, setInst] = useState<Instrument>("All");
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [trades, setTrades] = useState<PerfTrade[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fetchTrades = useServerFn(listPerfTrades);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!cancelled) setAuthed(!!data.session);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!authed) return;
    let cancelled = false;
    setBusy(true);
    setErr(null);
    fetchTrades()
      .then((r) => {
        if (!cancelled) setTrades(r.trades ?? []);
      })
      .catch((e: unknown) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Failed to load performance");
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authed, fetchTrades]);

  const filtered = useMemo(
    () => (inst === "All" ? trades : trades.filter((t) => t.symbol === inst)),
    [trades, inst],
  );

  // Rolling window = last N sessions (unique plan dates).
  const windowed = useMemo(() => {
    if (windowKey === "All") return filtered;
    const nDays = windowKey === "L5" ? 5 : windowKey === "L10" ? 10 : 20;
    const dates = Array.from(new Set(filtered.map((t) => t.plan_date))).sort();
    const keep = new Set(dates.slice(-nDays));
    return filtered.filter((t) => keep.has(t.plan_date));
  }, [filtered, windowKey]);

  const stats = useMemo(() => computeStats(windowed), [windowed]);
  const esStats = useMemo(() => computeStats(windowed.filter((t) => t.symbol === "ES")), [windowed]);
  const nqStats = useMemo(() => computeStats(windowed.filter((t) => t.symbol === "NQ")), [windowed]);
  const exc = useMemo(() => computeExcursions(windowed), [windowed]);

  const equity = useMemo(() => {
    let v = 0;
    const seen = new Set<number>();
    const out: Array<{ time: number; value: number }> = [];
    for (const t of windowed) {
      v += tradeUsd(t);
      const day = Math.floor(new Date(`${t.plan_date}T00:00:00Z`).getTime() / 1000);
      if (seen.has(day)) out[out.length - 1] = { time: day, value: Math.round(v) };
      else {
        seen.add(day);
        out.push({ time: day, value: Math.round(v) });
      }
    }
    return out;
  }, [windowed]);

  const range = useMemo(() => {
    if (!windowed.length) return null;
    const dates = windowed.map((t) => t.plan_date).sort();
    return { from: dates[0], to: dates[dates.length - 1] };
  }, [windowed]);

  function reportText(): string {
    const head = `**JD Trading Planner | Auto-Trader Performance**`;
    const span = range ? `**Period:** ${fmtDate(range.from)} – ${fmtDate(range.to)}` : "**Period:** —";
    const line = (label: string, s: Stats) =>
      `${label}: ${s.n} trades · ${s.wins}W / ${s.losses}L · ${s.winPct.toFixed(1)}% · ${pts(s.netPts)} pts · ${usd(s.netUsd)}`;
    return [
      head,
      span,
      `**Window:** ${windowKey}${inst !== "All" ? ` · ${inst}` : ""}`,
      "",
      line("**Total**", stats),
      esStats.n ? line("ES", esStats) : null,
      nqStats.n ? line("NQ", nqStats) : null,
      "",
      `Avg win: ${usd(stats.avgWinUsd)} · Avg loss: ${usd(stats.avgLossUsd)}`,
      `Profit factor: ${stats.profitFactor === null ? "—" : stats.profitFactor.toFixed(2)} · Max drawdown: -$${Math.round(stats.maxDdUsd).toLocaleString("en-US")}`,
      exc.tracked
        ? `Losers ever in profit: ${exc.everGreen}/${exc.tracked} · Avg peak: ${pts(exc.avgPeak)} pts/contract · Peak beat risk: ${exc.beyondRisk}`
        : null,
      "@everyone",
    ]
      .filter(Boolean)
      .join("\n");
  }

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(reportText());
      toast.success("Performance report copied");
    } catch {
      toast.error("Copy failed");
    }
  }

  if (authed === false) {
    return (
      <AppShell title="Performance" subtitle="Auto-Trader Results">
        <Panel title="Sign in required">
          <p className="text-sm text-muted-foreground">
            Sign in to see your trading performance.
          </p>
        </Panel>
      </AppShell>
    );
  }

  const tiles = [
    { k: "Trades", v: String(stats.n), tone: "" },
    { k: "Win Rate", v: `${stats.winPct.toFixed(1)}%`, tone: stats.winPct >= 50 ? "text-bull" : "text-bear" },
    { k: "Net Points", v: pts(stats.netPts), tone: stats.netPts >= 0 ? "text-bull" : "text-bear" },
    { k: "Net P&L", v: usd(stats.netUsd), tone: stats.netUsd >= 0 ? "text-bull" : "text-bear" },
  ];

  return (
    <AppShell title="Performance" subtitle="Auto-Trader Results">
      <Panel
        title={
          <span>
            Window{" "}
            {range && (
              <span className="mono hidden text-xs font-normal text-muted-foreground sm:inline">
                {fmtDate(range.from)} – {fmtDate(range.to)}
              </span>
            )}
          </span>
        }
        right={
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="flex rounded-md border border-border bg-surface-1 p-0.5">
              {(["All", "ES", "NQ"] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setInst(k)}
                  className={`mono rounded px-2 py-1 text-xs font-semibold ${
                    inst === k ? "bg-surface-2 text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>
            <div className="flex rounded-md border border-border bg-surface-1 p-0.5">
              {(["L5", "L10", "L20", "All"] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setWindowKey(k)}
                  className={`mono rounded px-2 py-1 text-xs font-semibold ${
                    windowKey === k ? "bg-surface-2 text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>
            <button
              onClick={copyReport}
              className="mono rounded-md border border-border bg-surface-1 px-2.5 py-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              Copy report
            </button>
          </div>
        }
      >
        {busy && !trades.length ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : err ? (
          <p className="text-sm text-bear">{err}</p>
        ) : !stats.n ? (
          <p className="text-sm text-muted-foreground">No closed trades in this window yet.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {tiles.map((t) => (
                <div key={t.k} className="rounded-md border border-border bg-surface-1 p-3">
                  <div className="label-xs">{t.k}</div>
                  <div className={`mono mt-1 text-2xl font-bold ${t.tone}`}>{t.v}</div>
                </div>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Mini k="Avg Win" v={usd(stats.avgWinUsd)} tone="text-bull" />
              <Mini k="Avg Loss" v={usd(stats.avgLossUsd)} tone="text-bear" />
              <Mini
                k="Profit Factor"
                v={stats.profitFactor === null ? "—" : stats.profitFactor.toFixed(2)}
                tone={(stats.profitFactor ?? 0) >= 1 ? "text-bull" : "text-bear"}
              />
              <Mini k="Max Drawdown" v={`-$${Math.round(stats.maxDdUsd).toLocaleString("en-US")}`} tone="text-bear" />
            </div>
          </>
        )}
      </Panel>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Panel title="Equity Curve (USD)" className="lg:col-span-2">
          {equity.length > 1 ? (
            <EquityChart data={equity} />
          ) : (
            <p className="text-sm text-muted-foreground">Not enough closed trades to plot a curve.</p>
          )}
        </Panel>
        <Panel title="By Instrument">
          <div className="space-y-3">
            <SymbolBlock label="ES" s={esStats} />
            <SymbolBlock label="NQ" s={nqStats} />
          </div>
        </Panel>
      </div>

      <div className="mt-3">
        <Panel
          title="Losing Trades — How Far Into Profit?"
          right={
            <span className="mono text-xs text-muted-foreground">
              {exc.untracked > 0 ? `${exc.untracked} older trades not tracked` : "peak / worst per contract"}
            </span>
          }
        >
          {!exc.tracked ? (
            <p className="text-sm text-muted-foreground">
              Peak-profit tracking starts with the next session. Trades closed before it was added don't
              carry a peak value{exc.untracked > 0 ? ` (${exc.untracked} in this window).` : "."}
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Mini k="Losers Tracked" v={String(exc.tracked)} tone="" />
                <Mini
                  k="Ever In Profit"
                  v={`${exc.everGreen} · ${((exc.everGreen / exc.tracked) * 100).toFixed(0)}%`}
                  tone="text-bull"
                />
                <Mini k="Avg Peak" v={`${pts(exc.avgPeak)} pts`} tone="text-bull" />
                <Mini k="Median Peak" v={`${pts(exc.medianPeak)} pts`} tone="" />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {exc.beyondRisk} of {exc.tracked} losing trades ran further in your favor than the amount
                risked before reversing — those are the ones an earlier partial would have saved. Peaks are
                per contract, measured from entry.
              </p>
            </>
          )}
        </Panel>
      </div>



      <div className="mt-3">
        <Panel title="Closed Trades">
          {!windowed.length ? (
            <p className="text-sm text-muted-foreground">Nothing to show.</p>
          ) : (
            <div className="space-y-1.5">
              {[...windowed].reverse().map((t, i) => {
                const u = tradeUsd(t);
                return (
                  <div
                    key={`${t.plan_date}-${t.symbol}-${i}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-surface-1 px-3 py-2"
                  >
                    <div className="mono flex items-center gap-2 text-xs">
                      <span className="font-bold">{fmtDate(t.plan_date)}</span>
                      <span className="rounded bg-surface-2 px-1.5 py-0.5 font-semibold">{t.symbol}</span>
                      <span className="text-muted-foreground">
                        {t.side === "short" ? "SHORT" : "LONG"} · {t.entry_label ?? "—"} → {t.exit_label ?? "exit"}
                      </span>
                    </div>
                    <div className={`mono text-xs font-bold ${u >= 0 ? "text-bull" : "text-bear"}`}>
                      {pts(Number(t.realized_points ?? 0))} pts · {usd(u)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </div>
    </AppShell>
  );
}

function Mini({ k, v, tone }: { k: string; v: string; tone: string }) {
  return (
    <div className="rounded-md border border-border bg-surface-1 p-3">
      <div className="label-xs">{k}</div>
      <div className={`mono mt-1 text-base font-bold ${tone}`}>{v}</div>
    </div>
  );
}

function SymbolBlock({ label, s }: { label: string; s: Stats }) {
  if (!s.n) {
    return (
      <div className="rounded-md border border-border bg-surface-1 p-3">
        <div className="label-xs">{label}</div>
        <div className="mt-1 text-xs text-muted-foreground">No trades</div>
      </div>
    );
  }
  return (
    <div className="rounded-md border border-border bg-surface-1 p-3">
      <div className="flex items-center justify-between">
        <span className="mono text-sm font-bold">{label}</span>
        <span className={`mono text-sm font-bold ${s.netUsd >= 0 ? "text-bull" : "text-bear"}`}>{usd(s.netUsd)}</span>
      </div>
      <div className="mono mt-1 text-xs text-muted-foreground">
        {s.n} trades · {s.wins}W / {s.losses}L · {s.winPct.toFixed(1)}%
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full bg-bull" style={{ width: `${s.winPct}%` }} />
      </div>
      <div className="mono mt-1 text-xs text-muted-foreground">{pts(s.netPts)} pts</div>
    </div>
  );
}
