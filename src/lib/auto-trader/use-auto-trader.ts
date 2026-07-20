import { useEffect, useMemo, useRef, useState } from "react";
import { advance, initialState, type TradeState, type Bar } from "./state";
import type { DailyPlanRow } from "@/lib/plans.functions";
import type { Candle } from "@/lib/chart-utils";
import { toast } from "sonner";
import { loadAutoPostTrades, sendToDiscord } from "@/lib/discord-client";

type SymbolId = "ES" | "NQ";

const STORAGE_KEY = (sym: SymbolId, date: string) => `auto-trader:v3:${sym}:${date}`;
const ENABLED_KEY = "auto-trader:enabled";

function fmtEt(t: number): string {
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

function loadEnabled(): boolean {
  if (typeof window === "undefined") return true;
  const v = window.localStorage.getItem(ENABLED_KEY);
  return v === null ? true : v === "1";
}

function persist(state: TradeState) {
  try {
    window.localStorage.setItem(STORAGE_KEY(state.symbol, state.planDate), JSON.stringify(state));
  } catch { /* ignore */ }
}
function hydrate(sym: SymbolId, date: string): TradeState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY(sym, date));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TradeState;
    // Guard against pre-v3 shape (missing mode / completedLegs).
    if (!parsed.mode || !parsed.armSide || !Array.isArray(parsed.ladderAhead) || !Array.isArray(parsed.completedLegs)) return null;
    return parsed;
  } catch { return null; }
}

export interface UseAutoTraderResult {
  state: TradeState | null;
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  reset: () => void;
  disabledReason: string | null;
}

export function useAutoTrader(
  plan: DailyPlanRow | null,
  bars: Candle[],
  symbol: SymbolId,
): UseAutoTraderResult {
  const [enabled, setEnabledState] = useState<boolean>(() => loadEnabled());
  const [state, setState] = useState<TradeState | null>(null);
  const stateRef = useRef<TradeState | null>(null);
  stateRef.current = state;
  // Track how many events we've already posted per (symbol,date) so a rehydrate
  // doesn't re-fire old events and so we only post genuinely new ones.
  const postedCountRef = useRef<number>(0);

  const disabledReason = useMemo(() => {
    if (!plan) return "No plan available.";
    if (!enabled) return "Auto-trader disabled.";
    return null;
  }, [plan, enabled]);

  const setEnabled = (v: boolean) => {
    setEnabledState(v);
    if (typeof window !== "undefined") window.localStorage.setItem(ENABLED_KEY, v ? "1" : "0");
  };

  const reset = () => {
    if (!plan) return;
    const fresh = initialState(plan, symbol);
    setState(fresh);
    persist(fresh);
    postedCountRef.current = 0;
    toast("Auto-trader reset for the day.");
  };

  // (Re)initialize when plan/symbol changes.
  useEffect(() => {
    if (!plan) { setState(null); return; }
    const hy = hydrate(symbol, plan.plan_date);
    if (hy && hy.planDate === plan.plan_date) {
      setState(hy);
      // Treat rehydrated events as already-posted so a page refresh doesn't re-send.
      postedCountRef.current = hy.events.length;
    } else {
      const fresh = initialState(plan, symbol);
      setState(fresh);
      persist(fresh);
      postedCountRef.current = 0;
    }
  }, [plan?.plan_date, plan?.bias, symbol, plan]);

  // Advance on new bars.
  useEffect(() => {
    if (!plan || !enabled) return;
    const cur = stateRef.current;
    if (!cur) return;
    if (cur.mode === "directional" && (cur.phase === "stopped" || cur.phase === "closed_win")) return;
    if (!bars.length) return;

    const autoPost = loadAutoPostTrades();
    let next = cur;
    let changed = false;
    for (const b of bars) {
      if (b.time <= next.lastBarTime) continue;
      const bar: Bar = { time: b.time, open: b.open, high: b.high, low: b.low, close: b.close };
      next = advance(next, plan, bar);
    }
    if (next !== cur) {
      changed = true;
      const newEvents = next.events.slice(postedCountRef.current);
      for (const ev of newEvents) {
        if (ev.kind === "entry") toast.success(ev.note ?? "Entry");
        else if (ev.kind === "scale1" || ev.kind === "scale2") toast.success(ev.note ?? "Scale");
        else if (ev.kind === "stop_hit") toast.error(ev.note ?? "Stop hit");
        else if (ev.kind === "ext1_hit") toast.success(ev.note ?? "EXT1 hit");
        else if (ev.kind === "target_hit") toast(ev.note ?? "Target");
        else if (ev.kind === "stop_moved") toast(ev.note ?? "Stop moved");
        else if (ev.kind === "leg_closed") toast(ev.note ?? "Leg closed");

        console.info(`[auto-trader] event autoPost=${autoPost} kind=${ev.kind}`, ev.note);
        if (autoPost) {
          const line = `${eventEmoji(ev.kind)} **Auto-Trader | ${symbol}** · ${fmtEt(ev.time)} ET · ${ev.note ?? ev.kind}`;
          // Non-silent while we diagnose: success toasts confirm the round-trip.
          sendToDiscord(line, { silent: false, label: "Auto-trader" });
        }
      }
      postedCountRef.current = next.events.length;
    }
    if (changed) {
      setState(next);
      persist(next);
    }
  }, [bars, plan, enabled, symbol]);

  return { state, enabled, setEnabled, reset, disabledReason };
}
