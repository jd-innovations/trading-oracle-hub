import { useEffect, useMemo, useRef, useState } from "react";
import { advance, initialState, type TradeState, type Bar } from "./state";
import type { DailyPlanRow } from "@/lib/plans.functions";
import type { Candle } from "@/lib/chart-utils";
import { toast } from "sonner";

type SymbolId = "ES" | "NQ";

const STORAGE_KEY = (sym: SymbolId, date: string) => `auto-trader:v2:${sym}:${date}`;
const ENABLED_KEY = "auto-trader:enabled";

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
    // Guard against pre-v2 shape (missing side / ladderAhead)
    if (!parsed.side || !Array.isArray(parsed.ladderAhead)) return null;
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

  const disabledReason = useMemo(() => {
    if (!plan) return "No plan available.";
    if (plan.bias === "Neutral") return "Plan bias is Neutral — auto-trader idle.";
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
    toast("Auto-trader reset for the day.");
  };

  // (Re)initialize when plan/symbol changes.
  useEffect(() => {
    if (!plan || plan.bias === "Neutral") { setState(null); return; }
    const hy = hydrate(symbol, plan.plan_date);
    if (hy && hy.planDate === plan.plan_date) {
      setState(hy);
    } else {
      const fresh = initialState(plan, symbol);
      setState(fresh);
      persist(fresh);
    }
  }, [plan?.plan_date, plan?.bias, symbol, plan]);

  // Advance on new bars.
  useEffect(() => {
    if (!plan || !enabled || plan.bias === "Neutral") return;
    const cur = stateRef.current;
    if (!cur) return;
    if (cur.phase === "stopped" || cur.phase === "closed_win") return;
    if (!bars.length) return;


    let next = cur;
    let changed = false;
    for (const b of bars) {
      if (b.time <= next.lastBarTime) continue;
      const prev = next;
      const bar: Bar = { time: b.time, open: b.open, high: b.high, low: b.low, close: b.close };
      next = advance(next, plan, bar);
      if (next !== prev) {
        changed = true;
        // Toast the newest events
        const newEvents = next.events.slice(prev.events.length);
        for (const ev of newEvents) {
          if (ev.kind === "entry") toast.success(ev.note ?? "Entry");
          else if (ev.kind === "scale1" || ev.kind === "scale2") toast.success(ev.note ?? "Scale");
          else if (ev.kind === "stop_hit") toast.error(ev.note ?? "Stop hit");
          else if (ev.kind === "ext1_hit") toast.success(ev.note ?? "EXT1 hit");
          else if (ev.kind === "target_hit") toast(ev.note ?? "Target");
          else if (ev.kind === "stop_moved") toast(ev.note ?? "Stop moved");
        }
      }
    }
    if (changed) {
      setState(next);
      persist(next);
    }
  }, [bars, plan, enabled]);

  return { state, enabled, setEnabled, reset, disabledReason };
}
