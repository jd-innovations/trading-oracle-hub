import { useEffect, useMemo, useState } from "react";
import { Copy, Check, Power, RotateCcw, Send, BellOff, Bell, Zap } from "lucide-react";
import { Panel } from "@/components/layout/AppShell";
import { fmtPrice } from "@/lib/format";
import { useAutoTrader } from "@/lib/auto-trader/use-auto-trader";
import { loadAutoPostTrades, saveAutoPostTrades, sendToDiscord } from "@/lib/discord-client";
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
    case "leg_closed": return "🔁";
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
  const { state, enabled, setEnabled, reset, disabledReason, diag } = useAutoTrader(plan, bars, symbol);
  const [copied, setCopied] = useState(false);
  const [autoPost, setAutoPost] = useState<boolean>(() => loadAutoPostTrades());
  useEffect(() => { saveAutoPostTrades(autoPost); }, [autoPost]);

  const micro = MICRO[symbol];
  const isNeutral = state?.mode === "neutral";
  const currentSide = state?.side ?? (plan?.bias === "Bearish" ? "short" : plan?.bias === "Bullish" ? "long" : undefined);
  const modeLabel = isNeutral ? "NEUTRAL" : currentSide === "short" ? "SHORT" : "LONG";
  const sideLabel = currentSide === "short" ? "SHORT" : currentSide === "long" ? "LONG" : "—";

  const unrealized = useMemo(() => {
    if (!state || state.phase !== "in_trade" || livePrice == null || state.entry == null) return 0;
    const dir = state.side === "short" ? -1 : 1;
    return (livePrice - state.entry) * dir * state.contracts;
  }, [state, livePrice]);

  const discordText = useMemo(() => {
    if (!state) return "";
    const header = `**Auto-Trader | ${symbol} (${micro}) ${modeLabel}** — ${state.planDate}`;
    const lines = state.events.map((ev) => `${eventEmoji(ev.kind)} ${fmtTime(ev.time)} · ${ev.note ?? ev.kind}`);
    let footer = "";
    if (state.phase === "in_trade") {
      footer = `📌 Open: ${sideLabel} ${state.contracts}x @ ${state.entry?.toFixed(2)} · Stop ${state.stop?.toFixed(2)} (${state.stopLabel})`;
    } else if (state.mode === "directional" && state.phase === "closed_win") {
      footer = `✅ Closed +${state.realizedPoints.toFixed(2)} pts`;
    } else if (state.mode === "directional" && state.phase === "stopped") {
      footer = `❌ Stopped ${state.realizedPoints.toFixed(2)} pts`;
    } else if (state.mode === "neutral" && state.completedLegs.length > 0) {
      footer = `📊 Legs: ${state.completedLegs.length} · Total ${state.realizedPoints >= 0 ? "+" : ""}${state.realizedPoints.toFixed(2)} pts`;
    }
    return [header, ...lines, footer].filter(Boolean).join("\n");
  }, [state, symbol, micro, modeLabel, sideLabel]);

  const copy = () => {
    navigator.clipboard.writeText(discordText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const statusPill = (() => {
    if (!enabled) return { text: "DISABLED", tone: "text-muted-foreground border-border" };
    if (!plan) return { text: "NO PLAN", tone: "text-muted-foreground border-border" };
    if (!state) return { text: "INIT…", tone: "text-muted-foreground border-border" };
    const armTone = "text-emerald-500 border-emerald-500/40 bg-emerald-500/10";
    const bullTone = "text-bull border-bull/40 bg-bull/10";
    const bearTone = "text-bear border-bear/40 bg-bear/10";
    if (state.mode === "neutral") {
      if (state.phase === "armed") {
        if (state.armSide === "either") return { text: "ARMED · NEUTRAL — either", tone: armTone };
        if (state.armSide === "long")   return { text: "ARMED · NEUTRAL → LONG (T2↓/T3↓)", tone: armTone };
        if (state.armSide === "short")  return { text: "ARMED · NEUTRAL → SHORT (T2↑/T3↑)", tone: armTone };
      }
      if (state.phase === "in_trade") {
        const t = state.side === "short" ? bearTone : bullTone;
        return { text: `IN TRADE · NEUTRAL · ${sideLabel} · ${state.contracts}x`, tone: t };
      }
      return { text: state.phase, tone: "text-muted-foreground border-border" };
    }
    // directional
    const winTone = currentSide === "short" ? bearTone : bullTone;
    if (state.phase === "armed") return { text: `ARMED · ${sideLabel}`, tone: armTone };
    if (state.phase === "in_trade") return { text: `IN TRADE · ${sideLabel} · ${state.contracts}x`, tone: winTone };
    if (state.phase === "closed_win") return { text: `CLOSED +${state.realizedPoints.toFixed(2)}`, tone: bullTone };
    if (state.phase === "stopped") return { text: `STOPPED ${state.realizedPoints.toFixed(2)}`, tone: bearTone };
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
        onClick={() => setAutoPost(!autoPost)}
        className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider hover:text-foreground ${
          autoPost
            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
            : "border-border bg-surface-2 text-muted-foreground"
        }`}
        title={autoPost ? "Auto-post events to Discord (on)" : "Auto-post events to Discord (off)"}
      >
        {autoPost ? <Bell className="h-3 w-3" /> : <BellOff className="h-3 w-3" />}
        Auto
      </button>
      <button
        onClick={reset}
        className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-2 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
        title="Reset day"
      >
        <RotateCcw className="h-3 w-3" /> Reset
      </button>
      <button
        onClick={() => {
          const now = Math.floor(Date.now() / 1000);
          const line = `🧪 **Auto-Trader | ${symbol}** · ${fmtTime(now)} ET · Test event (synthetic)`;
          sendToDiscord(line, { silent: false, label: "Auto-trader test" });
        }}
        className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-500 hover:bg-amber-500/20"
        title="Send a synthetic auto-trader event to Discord"
      >
        <Zap className="h-3 w-3" /> Test event
      </button>
      <button
        onClick={() => sendToDiscord(discordText, { label: "Trade" })}
        disabled={!discordText}
        className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-2 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground disabled:opacity-40"
        title="Post current trade summary to Discord"
      >
        <Send className="h-3 w-3" /> Post
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

  const watchingCopy = state?.mode === "neutral"
    ? state.armSide === "short"
      ? "Watching T2↑/T3↑ for a short setup…"
      : state.armSide === "long"
        ? "Watching T2↓/T3↓ for a long setup…"
        : "Watching T2/T3 on either side for the first valid pullback…"
    : "Watching for the first valid pullback into a published support level…";

  return (
    <Panel title={`Auto-Trader · ${micro} (${modeLabel})`} right={controls}>
      {disabledReason && !state && (
        <p className="text-xs text-muted-foreground">{disabledReason}</p>
      )}

      {state && (
        <div className="space-y-3">
          {state.mode === "neutral" && state.completedLegs.length > 0 && (
            <div className="rounded-md border border-border/60 bg-surface-1 p-2">
              <div className="mb-1 flex items-center justify-between">
                <span className="label-xs">Completed legs</span>
                <span className={`mono text-xs font-semibold ${state.realizedPoints >= 0 ? "text-bull" : "text-bear"}`}>
                  {state.completedLegs.length} · {state.realizedPoints >= 0 ? "+" : ""}{state.realizedPoints.toFixed(2)} pts
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {state.completedLegs.map((leg, i) => {
                  const win = leg.realized >= 0;
                  const tone = win ? "border-bull/40 bg-bull/10 text-bull" : "border-bear/40 bg-bear/10 text-bear";
                  const sideTag = leg.side === "long" ? "L" : "S";
                  return (
                    <span key={i} className={`mono rounded border px-1.5 py-0.5 text-[11px] ${tone}`}>
                      {sideTag} {leg.entryLabel} → {leg.exitLabel ?? fmtPrice(leg.exit)} · {win ? "+" : ""}{leg.realized.toFixed(2)}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <Stat label="Entry" value={state.entry != null ? fmtPrice(state.entry) : "—"} sub={state.entryLabel} />
            <Stat label="Stop"  value={state.stop  != null ? fmtPrice(state.stop)  : "—"} sub={state.stopLabel} tone="bear" />
            <Stat label="Contracts" value={String(state.contracts)} sub={`of 3 · scaled ${state.scaled}`} />
            <Stat label="Realized" value={`${state.realizedPoints >= 0 ? "+" : ""}${state.realizedPoints.toFixed(2)}`} sub="pts" tone={state.realizedPoints >= 0 ? "bull" : "bear"} />
            <Stat label="Unrealized" value={state.phase === "in_trade" ? `${unrealized >= 0 ? "+" : ""}${unrealized.toFixed(2)}` : "—"} sub="pts" tone={unrealized >= 0 ? "bull" : "bear"} />
          </div>

          {state.ladderAhead.length > 0 && state.phase === "in_trade" && (
            <div className="rounded-md border border-border/60 bg-surface-1 p-2">
              <div className="label-xs mb-1">Ladder ahead of entry</div>
              <div className="flex flex-wrap gap-1.5">
                {state.ladderAhead.map((lv, i) => {
                  const accepted = i <= state.acceptedIdx;
                  const acceptedTone = state.side === "short"
                    ? "border-bear/40 bg-bear/10 text-bear"
                    : "border-bull/40 bg-bull/10 text-bull";
                  return (
                    <span
                      key={`${lv.label}-${i}`}
                      className={`mono rounded border px-1.5 py-0.5 text-[11px] ${
                        accepted ? acceptedTone : "border-border bg-surface-2 text-muted-foreground"
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
              <p className="px-2 pb-2 pt-1 text-xs text-muted-foreground">{watchingCopy}</p>
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
