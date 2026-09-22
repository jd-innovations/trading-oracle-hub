import { useEffect, useMemo, useRef, useState } from "react";
import { advance, initialState, isRthBar, inCoolOff, DEFAULT_CONFIG, type AutoTraderConfig, type TradeState, type Bar } from "./state";
import { buildLadder, entryPool } from "./levels";
import type { DailyPlanRow } from "@/lib/plans.functions";
import type { Candle } from "@/lib/chart-utils";
import { toast } from "sonner";
// Discord posting + journal logging are handled server-side by
// /api/public/auto-trader/tick (pg_cron). Client only shows toasts.

type SymbolId = "ES" | "NQ";

const STORAGE_KEY = (sym: SymbolId, date: string) => `auto-trader:v3:${sym}:${date}`;
const ENABLED_KEY = "auto-trader:enabled";
const DEBUG_KEY = "auto-trader:debug";

function debugOn(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(DEBUG_KEY) === "1";
}

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

export interface EntryPoolDiag {
  side: "long" | "short";
  label: string;
  price: number;
  /** Positive = distance still to travel; ≤ 0 = level already tagged. */
  deltaPts: number;
  closestPrice: number;
  closestTime?: number;
}

export interface AutoTraderDiag {
  planDate: string;
  symbol: SymbolId;
  barsSeen: number;
  rthBarsSeen: number;
  rejectedWrongDate: number;
  firstBarEt?: number;
  lastBarEt?: number;
  pool: EntryPoolDiag[];
}

export interface UseAutoTraderResult {
  state: TradeState | null;
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  reset: () => void;
  disabledReason: string | null;
  diag: AutoTraderDiag | null;
  /** True while the opening cool-off window is still blocking new entries. */
  coolOffActive: boolean;
}

function etDateKey(t: number): string {
  const d = new Date(t * 1000);
  // ET is UTC-4 in DST (Jul 2026 is DST).
  const shifted = new Date((t - 4 * 3600) * 1000);
  void d;
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
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
  const postedCountRef = useRef<number>(0);
  const loggedLegCountRef = useRef<number>(0);
  

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

  // (Re)initialize when plan/symbol changes. Also guard against symbol mismatch on hydrate.
  useEffect(() => {
    if (!plan) { setState(null); return; }
    const hy = hydrate(symbol, plan.plan_date);
    if (hy && hy.planDate === plan.plan_date && hy.symbol === symbol) {
      setState(hy);
      postedCountRef.current = hy.events.length;
      loggedLegCountRef.current = hy.completedLegs.length;
    } else {
      if (hy && hy.symbol !== symbol) {
        console.warn(`[auto-trader] hydrate symbol mismatch: stored=${hy.symbol} prop=${symbol} — resetting`);
      }
      const fresh = initialState(plan, symbol);
      setState(fresh);
      persist(fresh);
      postedCountRef.current = 0;
      loggedLegCountRef.current = 0;
    }
  }, [plan?.plan_date, plan?.bias, symbol, plan]);

  // Advance on new bars.
  useEffect(() => {
    if (!plan || !enabled) return;
    const cur = stateRef.current;
    if (!cur) return;
    if (cur.mode === "directional" && (cur.phase === "stopped" || cur.phase === "closed_win")) return;
    if (!bars.length) return;

    const dbg = debugOn();
    let next = cur;
    let changed = false;
    for (const b of bars) {
      if (b.time <= next.lastBarTime) continue;
      const bar: Bar = { time: b.time, open: b.open, high: b.high, low: b.low, close: b.close };

      if (dbg && isRthBar(bar.time) && etDateKey(bar.time) === next.planDate) {
        const ladder = buildLadder(plan);
        const info = entryPool(ladder, next.mode, next.side, next.armSide);
        const pool = info.levels.concat(info.shortLevels ?? []);
        const poolStr = pool.map((l) => `${l.label}:${l.price.toFixed(2)}`).join(",");
        console.log(
          `[auto-trader] ${fmtEt(bar.time)} phase=${next.phase} side=${next.side ?? "-"} arm=${next.armSide} O=${bar.open.toFixed(2)} H=${bar.high.toFixed(2)} L=${bar.low.toFixed(2)} C=${bar.close.toFixed(2)} pool=[${poolStr}]`,
        );
      }

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

        console.info(`[auto-trader] event kind=${ev.kind}`, ev.note);
        // Discord posting and journal logging are handled server-side by
        // /api/public/auto-trader/tick (pg_cron every minute during RTH) so
        // alerts fire even when no browser tab is open. The client only
        // shows toasts.
      }
      postedCountRef.current = next.events.length;
      loggedLegCountRef.current = next.completedLegs.length;
    }
    if (changed) {
      setState(next);
      persist(next);
    }
  }, [bars, plan, enabled, symbol]);

  // Live diagnostic: closest approach per pool level today.
  const diag = useMemo<AutoTraderDiag | null>(() => {
    if (!plan || !state) return null;
    const ladder = buildLadder(plan);
    const info = entryPool(ladder, state.mode, state.side, state.armSide);
    const longPool: { side: "long"; level: { price: number; label: string } }[] =
      (info.side === "long" || info.side === "either")
        ? (info.side === "either" ? info.levels : info.levels).map((l) => ({ side: "long", level: l }))
        : [];
    const shortPool: { side: "short"; level: { price: number; label: string } }[] =
      info.side === "short"
        ? info.levels.map((l) => ({ side: "short", level: l }))
        : info.side === "either" && info.shortLevels
          ? info.shortLevels.map((l) => ({ side: "short", level: l }))
          : [];
    const all = [...longPool, ...shortPool];

    // Init closest with +Infinity delta.
    const closest = new Map<string, { deltaPts: number; closestPrice: number; time?: number; side: "long" | "short"; label: string; price: number }>();
    for (const p of all) {
      closest.set(p.level.label + ":" + p.side, {
        deltaPts: Number.POSITIVE_INFINITY,
        closestPrice: NaN,
        side: p.side,
        label: p.level.label,
        price: p.level.price,
      });
    }

    let barsSeen = 0;
    let rthBarsSeen = 0;
    let rejectedWrongDate = 0;
    let firstEt: number | undefined;
    let lastEt: number | undefined;
    for (const b of bars) {
      barsSeen++;
      if (!isRthBar(b.time)) continue;
      if (etDateKey(b.time) !== state.planDate) {
        rejectedWrongDate++;
        continue;
      }
      rthBarsSeen++;
      if (firstEt == null) firstEt = b.time;
      lastEt = b.time;
      for (const p of all) {
        const key = p.level.label + ":" + p.side;
        const rec = closest.get(key)!;
        if (p.side === "long") {
          const delta = b.low - p.level.price;
          if (delta < rec.deltaPts) { rec.deltaPts = delta; rec.closestPrice = b.low; rec.time = b.time; }
        } else {
          const delta = p.level.price - b.high;
          if (delta < rec.deltaPts) { rec.deltaPts = delta; rec.closestPrice = b.high; rec.time = b.time; }
        }
      }
    }

    const poolDiag: EntryPoolDiag[] = Array.from(closest.values())
      .filter((r) => Number.isFinite(r.deltaPts))
      .map((r) => ({
        side: r.side,
        label: r.label,
        price: r.price,
        deltaPts: r.deltaPts,
        closestPrice: r.closestPrice,
        closestTime: r.time,
      }));

    return {
      planDate: state.planDate,
      symbol,
      barsSeen,
      rthBarsSeen,
      rejectedWrongDate,
      firstBarEt: firstEt,
      lastBarEt: lastEt,
      pool: poolDiag,
    };
  }, [plan, state, bars, symbol]);

  return { state, enabled, setEnabled, reset, disabledReason, diag };
}
