import { useMemo, useState } from "react";
import { Copy, Check, Power, RotateCcw } from "lucide-react";
import { Panel } from "@/components/layout/AppShell";
import { fmtPrice } from "@/lib/format";
import { useAutoTrader } from "@/lib/auto-trader/use-auto-trader";
import type { DailyPlanRow } from "@/lib/plans.functions";
import type { Candle } from "@/lib/chart-utils";

type SymbolId = "ES" | "NQ";
const MICRO: Record<SymbolId, string> = { ES: "MES", NQ: "MNQ" };

function fmtTime(t: number): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(t * 1000));
}

function eventEmoji(kind: string): string {
  switch (kind) {
    case "entry": return "🟢";
    case "scale1":
    case "scale2": return "💰";
    case "stop_moved": return "🔧";
    case "stop_hit": return "🛑";
    case "target_hit": return "🎯";
    case "ext1_hit": return "🏁";
    case "closed": return "⏹";
    default: return "•";
  }
}

export function TradeCard({
  plan,
  bars,
  symbol,
  livePrice,
}: {
  plan: DailyPlanRow | null;
  bars: Candle[];
  symbol: SymbolId;
  livePrice?: number;
}) {
  const { state, enabled, setEnabled, reset, disabledReason } = useAutoTrader(plan, bars, symbol);
  const [copied, setCopied] = useState(false);

  const micro = MICRO[symbol];

  const unrealized = useMemo(() => {
    if (!state || state.phase !== "in_trade" || livePrice == null || state.entry == null) return 0;
    return (livePrice - state.entry) * state.contracts;
  }, [state, livePrice]);

  const discordText = useMemo(() => {
    if (!state) return "";
    const header = `**Auto-Trader | ${symbol} (${micro})** — ${state.planDate}`;
    const lines = state.events.map((ev) => `${eventEmoji(ev.kind)} ${fmtTime(ev.time)} · ${ev.note ?? ev.kind}`);
    const footer =
      state.phase === "in_trade"
        ? `📌 Open: ${state.contracts}x @ ${state.entry?.toFixed(2)} · Stop ${state.stop?.toFixed(2)} (${state.stopLabel})`
        : state.phase === "closed_win" ? `✅ Closed +${state.realizedPoints.toFixed(2)} pts`
        : state.phase === "stopped" ? `❌ Stopped ${state.realizedPoints.toFixed(2)} pts`
        : "";
    return [header, ...lines, footer].filter(Boolean).join("\n");
  }, [state, symbol, micro]);

  const copy = () => {
    navigator.clipboard.writeText(discordText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const statusPill = (() => {
    if (!enabled) return { text: "DISABLED", tone: "text-muted-foreground border-border" };
    if (!plan) return { text: "NO PLAN", tone: "text-muted-foreground border-border" };
    if (plan.bias !== "Bullish") return { text: `IDLE · ${plan.bias.toUpperCase()}`, tone: "text-info border-info/40 bg-info/10" };
    if (!state) return { text: "INIT…", tone: "text-muted-foreground border-border" };
    if (state.phase === "armed") return { text: "ARMED", tone: "text-emerald-500 border-emerald-500/40 bg-emerald-500/10" };
    if (state.phase === "in_trade") return { text: `IN TRADE · ${state.contracts}x`, tone: "text-bull border-bull/40 bg-bull/10" };
    if (state.phase === "closed_win") return { text: `CLOSED +${state.realizedPoints.toFixed(2)}`, tone: "text-bull border-bull/40 bg-bull/10" };
    if (state.phase === "stopped") return { text: `STOPPED ${state.realizedPoints.toFixed(2)}`, tone: "text-bear border-bear/40 bg-bear/10" };
    return { text: state.phase, tone: "text-muted-foreground border-border" };
  })();

  const controls = (
    <div className="flex items-center gap-1.5">
      <span className={`mono rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusPill.tone}`}>
        {statusPill.text}
      </span>
      <button
        onClick={() => setEnabled(!enabled)}
        className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-2 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
        title={enabled ? "Disable auto-trader" : "Enable auto-trader"}
      >
        <Power className="h-3 w-3" />
        {enabled ? "On" : "Off"}
      </button>
      <button
        onClick={reset}
        className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-2 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
        title="Reset day"
      >
        <RotateCcw className="h-3 w-3" /> Reset
      </button>
      <button
        onClick={copy}
        disabled={!discordText}
        className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-2 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground disabled:opacity-40"
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );

  return (
    <Panel title={`Auto-Trader · ${micro}`} right={controls}>
      {disabledReason && !state && (
        <p className="text-xs text-muted-foreground">{disabledReason}</p>
      )}

      {state && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <Stat label="Entry" value={state.entry != null ? fmtPrice(state.entry) : "—"} sub={state.entryLabel} />
            <Stat label="Stop"  value={state.stop  != null ? fmtPrice(state.stop)  : "—"} sub={state.stopLabel} tone="bear" />
            <Stat label="Contracts" value={String(state.contracts)} sub={`of 3 · scaled ${state.scaled}`} />
            <Stat label="Realized" value={`${state.realizedPoints >= 0 ? "+" : ""}${state.realizedPoints.toFixed(2)}`} sub="pts" tone={state.realizedPoints >= 0 ? "bull" : "bear"} />
            <Stat label="Unrealized" value={state.phase === "in_trade" ? `${unrealized >= 0 ? "+" : ""}${unrealized.toFixed(2)}` : "—"} sub="pts" tone={unrealized >= 0 ? "bull" : "bear"} />
          </div>

          {state.above.length > 0 && state.phase === "in_trade" && (
            <div className="rounded-md border border-border/60 bg-surface-1 p-2">
              <div className="label-xs mb-1">Ladder above entry</div>
              <div className="flex flex-wrap gap-1.5">
                {state.above.map((lv, i) => {
                  const accepted = i <= state.acceptedIdx;
                  return (
                    <span
                      key={`${lv.label}-${i}`}
                      className={`mono rounded border px-1.5 py-0.5 text-[11px] ${
                        accepted
                          ? "border-bull/40 bg-bull/10 text-bull"
                          : "border-border bg-surface-2 text-muted-foreground"
                      }`}
                    >
                      {lv.label} {fmtPrice(lv.price)} {accepted ? "✓" : ""}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          <div className="rounded-md border border-border/60 bg-surface-1">
            <div className="label-xs px-2 pt-2">Event log</div>
            {state.events.length === 0 ? (
              <p className="px-2 pb-2 pt-1 text-xs text-muted-foreground">
                Watching for the first valid pullback into a published support level…
              </p>
            ) : (
              <ul className="mono max-h-56 overflow-auto px-2 pb-2 pt-1 text-[12px]">
                {state.events.map((ev, i) => (
                  <li key={i} className="border-t border-border/40 py-1 first:border-t-0">
                    <span className="mr-1">{eventEmoji(ev.kind)}</span>
                    <span className="text-muted-foreground">{fmtTime(ev.time)}</span>
                    <span className="mx-1">·</span>
                    <span>{ev.note ?? ev.kind}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "bull" | "bear" }) {
  const toneCls = tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : "text-foreground";
  return (
    <div className="rounded-md border border-border/60 bg-surface-1 px-2 py-1.5">
      <div className="label-xs">{label}</div>
      <div className={`mono text-sm font-semibold ${toneCls}`}>{value}</div>
      {sub && <div className="mono text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
