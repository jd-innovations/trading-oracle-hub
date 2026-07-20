// Pure state machine for the alerts-only auto-trader (LONG only).
// Consumes RTH 1-minute bars and a plan ladder; emits state transitions.

import {
  buildLadder,
  levelBelow,
  levelsAbove,
  supportLevels,
  ext1Price,
  upsideAvgSpacing,
  type Level,
} from "./levels";
import type { DailyPlanRow } from "@/lib/plans.functions";

export type Phase = "armed" | "in_trade" | "stopped" | "closed_win" | "disabled";

export interface TradeEvent {
  kind: "entry" | "scale1" | "scale2" | "stop_moved" | "stop_hit" | "target_hit" | "ext1_hit" | "closed";
  time: number; // seconds
  price: number;
  label?: string; // level label
  note?: string;
}

export interface TradeState {
  phase: Phase;
  planDate: string;
  symbol: "ES" | "NQ";
  contracts: number; // remaining
  entry?: number;
  entryLabel?: string;
  entryTime?: number;
  stop?: number;
  stopLabel?: string;
  scaled: 0 | 1 | 2;
  /** Levels strictly above entry (asc), incl. EXT1 once appended. */
  above: Level[];
  /** Highest index in `above` already accepted (touched). -1 = none. */
  acceptedIdx: number;
  ext1?: number;
  lastBarTime: number;
  events: TradeEvent[];
  /** Realized P/L in points, sum across contracts (3 total). */
  realizedPoints: number;
}

const CONTRACTS = 3;

export function initialState(plan: DailyPlanRow, symbol: "ES" | "NQ"): TradeState {
  return {
    phase: "armed",
    planDate: plan.plan_date,
    symbol,
    contracts: CONTRACTS,
    scaled: 0,
    above: [],
    acceptedIdx: -1,
    lastBarTime: 0,
    events: [],
    realizedPoints: 0,
  };
}

export interface Bar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

// ET RTH 09:30–16:00
const ET_OFFSET_HOURS = 4;
export function isRthBar(t: number): boolean {
  const d = new Date(t * 1000);
  const h = (d.getUTCHours() - ET_OFFSET_HOURS + 24) % 24;
  const m = h * 60 + d.getUTCMinutes();
  return m >= 9 * 60 + 30 && m < 16 * 60;
}
function etDateKey(t: number): string {
  const d = new Date((t - ET_OFFSET_HOURS * 3600) * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** Advance the state by a single bar. Returns the updated state (no mutation). */
export function advance(state: TradeState, plan: DailyPlanRow, bar: Bar): TradeState {
  if (state.phase === "stopped" || state.phase === "closed_win" || state.phase === "disabled") return state;
  if (bar.time <= state.lastBarTime) return state;
  if (!isRthBar(bar.time)) return { ...state, lastBarTime: bar.time };
  if (etDateKey(bar.time) !== state.planDate) return { ...state, lastBarTime: bar.time };

  const ladder = buildLadder(plan);
  let s: TradeState = { ...state, lastBarTime: bar.time, events: state.events };

  // --------- Entry ---------
  if (s.phase === "armed") {
    const supports = supportLevels(ladder);
    // Highest support the bar dipped through (first-tagged from above).
    let entryLevel: Level | null = null;
    for (let i = supports.length - 1; i >= 0; i--) {
      const lv = supports[i];
      if (bar.low <= lv.price && bar.open >= lv.price) { entryLevel = lv; break; }
    }
    // Fallback: gap-through — take the highest support with low <= level.
    if (!entryLevel) {
      for (let i = supports.length - 1; i >= 0; i--) {
        if (bar.low <= supports[i].price) { entryLevel = supports[i]; break; }
      }
    }
    if (!entryLevel) return s;

    const below = levelBelow(ladder, entryLevel.label);
    // If no level below (entry at T3↓), synthesize a stop = entry − avg downside spacing.
    let stop = below?.price;
    let stopLabel = below?.label;
    if (stop == null) {
      const avg = upsideAvgSpacing(ladder); // symmetric enough for a fallback
      stop = entryLevel.price - avg;
      stopLabel = "extension";
    }
    const above = levelsAbove(ladder, entryLevel.label);

    s = {
      ...s,
      phase: "in_trade",
      entry: entryLevel.price,
      entryLabel: entryLevel.label,
      entryTime: bar.time,
      stop,
      stopLabel,
      above,
      acceptedIdx: -1,
      events: [
        ...s.events,
        {
          kind: "entry",
          time: bar.time,
          price: entryLevel.price,
          label: entryLevel.label,
          note: `LONG ${CONTRACTS}x @ ${entryLevel.price.toFixed(2)} — stop ${stop.toFixed(2)} (${stopLabel ?? "?"})`,
        },
      ],
    };
    // Fall through — same bar may already scale/stop.
  }

  if (s.phase !== "in_trade") return s;

  // --------- Stop-out check (worst case first) ---------
  if (s.stop != null && bar.low <= s.stop) {
    const exitPx = s.stop;
    const perContract = exitPx - (s.entry ?? exitPx);
    const realized = s.realizedPoints + perContract * s.contracts;
    return {
      ...s,
      phase: perContract >= 0 ? "closed_win" : "stopped",
      realizedPoints: realized,
      contracts: 0,
      events: [
        ...s.events,
        {
          kind: "stop_hit",
          time: bar.time,
          price: exitPx,
          label: s.stopLabel,
          note: `Stop hit @ ${exitPx.toFixed(2)} — ${s.contracts}x closed`,
        },
        { kind: "closed", time: bar.time, price: exitPx },
      ],
    };
  }

  // --------- Upside acceptance sweep ---------
  // Append EXT1 once the last published upside is accepted.
  const above = s.above.slice();
  for (let i = s.acceptedIdx + 1; i < above.length; i++) {
    const lv = above[i];
    if (bar.high < lv.price) break; // asc; if this one wasn't touched, higher ones weren't either

    // Level touched -> transition
    const newEvents: TradeEvent[] = [];
    if (s.scaled === 0) {
      // Scale-out #1
      const perC = lv.price - (s.entry ?? lv.price);
      s.realizedPoints += perC * 1;
      s.contracts -= 1;
      s.scaled = 1;
      s.stop = s.entry;
      s.stopLabel = "BE";
      newEvents.push({
        kind: "scale1",
        time: bar.time,
        price: lv.price,
        label: lv.label,
        note: `Scale-1: sold 1 @ ${lv.price.toFixed(2)} (${lv.label}) · stop → BE ${s.entry!.toFixed(2)}`,
      });
    } else if (s.scaled === 1) {
      // Scale-out #2
      const perC = lv.price - (s.entry ?? lv.price);
      s.realizedPoints += perC * 1;
      s.contracts -= 1;
      s.scaled = 2;
      // stop → previous target level (scale1 = above[0])
      s.stop = above[0].price;
      s.stopLabel = above[0].label;
      newEvents.push({
        kind: "scale2",
        time: bar.time,
        price: lv.price,
        label: lv.label,
        note: `Scale-2: sold 1 @ ${lv.price.toFixed(2)} (${lv.label}) · stop → ${above[0].label} ${above[0].price.toFixed(2)}`,
      });
    } else {
      // Runner phase: trail stop to previously-accepted level.
      const prior = above[i - 1];
      if (prior) {
        s.stop = prior.price;
        s.stopLabel = prior.label;
        newEvents.push({
          kind: "stop_moved",
          time: bar.time,
          price: lv.price,
          label: lv.label,
          note: `Runner: ${lv.label} accepted @ ${lv.price.toFixed(2)} · stop → ${prior.label} ${prior.price.toFixed(2)}`,
        });
      }
    }

    s.acceptedIdx = i;

    // If this was the final published upside (before EXT1 append), append EXT1.
    const isFinalPublished = lv.label !== "EXT1" && i === above.length - 1;
    if (isFinalPublished) {
      const e = ext1Price(ladder);
      above.push({ price: e, label: "EXT1" });
      s.ext1 = e;
      newEvents.push({
        kind: "target_hit",
        time: bar.time,
        price: lv.price,
        label: lv.label,
        note: `Final target ${lv.label} accepted — EXT1 projected @ ${e.toFixed(2)}`,
      });
    }

    // If we just accepted EXT1 as runner, close.
    if (lv.label === "EXT1") {
      const perC = lv.price - (s.entry ?? lv.price);
      s.realizedPoints += perC * s.contracts;
      newEvents.push({
        kind: "ext1_hit",
        time: bar.time,
        price: lv.price,
        note: `EXT1 hit @ ${lv.price.toFixed(2)} — runner closed`,
      });
      newEvents.push({ kind: "closed", time: bar.time, price: lv.price });
      s.contracts = 0;
      s.phase = "closed_win";
      s.events = [...s.events, ...newEvents];
      s.above = above;
      return s;
    }

    s.events = [...s.events, ...newEvents];
  }

  s.above = above;
  return s;
}

export function replay(state: TradeState, plan: DailyPlanRow, bars: Bar[]): TradeState {
  let s = state;
  for (const b of bars) {
    s = advance(s, plan, b);
    if (s.phase === "stopped" || s.phase === "closed_win") break;
  }
  return s;
}
