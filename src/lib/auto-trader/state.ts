// Pure state machine for the alerts-only auto-trader.
// Supports directional (LONG/SHORT) modes and a NEUTRAL mode that arms
// both sides at T2/T3 only and re-arms the opposite side after each leg.

import {
  buildLadder,
  levelBelow,
  levelAbove,
  levelsAbove,
  levelsBelow,
  supportLevels,
  resistanceLevels,
  neutralLongEntries,
  neutralShortEntries,
  ext1Price,
  ext1PriceShort,
  upsideAvgSpacing,
  downsideAvgSpacing,
  type Level,
} from "./levels";
import type { DailyPlanRow } from "@/lib/plans.functions";

export type Phase = "armed" | "in_trade" | "stopped" | "closed_win" | "disabled";
export type Side = "long" | "short";
export type Mode = "directional" | "neutral";
export type ArmSide = "long" | "short" | "either";

export interface TradeEvent {
  kind: "entry" | "scale1" | "scale2" | "stop_moved" | "stop_hit" | "target_hit" | "ext1_hit" | "closed" | "leg_closed";
  time: number; // seconds
  price: number;
  label?: string; // level label
  note?: string;
}

export interface CompletedLeg {
  side: Side;
  entry: number;
  entryLabel: string;
  entryTime: number; // unix seconds
  exit: number;
  exitLabel?: string;
  exitTime: number; // unix seconds
  phase: "closed_win" | "stopped";
  realized: number;
  /** Max favorable excursion from entry, per contract, in points (>= 0). */
  mfe?: number;
  /** Max adverse excursion from entry, per contract, in points (<= 0). */
  mae?: number;
  /** Unix seconds of the bar where MFE peaked. */
  mfeTime?: number;
}

export interface TradeState {
  phase: Phase;
  mode: Mode;
  armSide: ArmSide;
  /** Current leg's side (undefined while armed "either"). */
  side?: Side;
  planDate: string;
  symbol: "ES" | "NQ";
  contracts: number;
  entry?: number;
  entryLabel?: string;
  entryTime?: number;
  stop?: number;
  stopLabel?: string;
  scaled: 0 | 1 | 2;
  ladderAhead: Level[];
  acceptedIdx: number;
  ext1?: number;
  lastBarTime: number;
  events: TradeEvent[];
  /** Cumulative realized P/L across every leg. */
  realizedPoints: number;
  /** Realized P/L for the leg currently open (or the one just closed until it's committed). */
  legRealized: number;
  /** Running max favorable excursion for the open leg, per contract, in points. */
  mfe: number;
  /** Running max adverse excursion for the open leg, per contract, in points (<= 0). */
  mae: number;
  /** Bar time where the running MFE peaked. */
  mfeTime: number;
  completedLegs: CompletedLeg[];
}

const CONTRACTS = 3;

export function initialState(plan: DailyPlanRow, symbol: "ES" | "NQ"): TradeState {
  const mode: Mode = plan.bias === "Neutral" ? "neutral" : "directional";
  const side: Side | undefined =
    plan.bias === "Bullish" ? "long" : plan.bias === "Bearish" ? "short" : undefined;
  const armSide: ArmSide = side ?? "either";
  return {
    phase: "armed",
    mode,
    armSide,
    side,
    planDate: plan.plan_date,
    symbol,
    contracts: CONTRACTS,
    scaled: 0,
    ladderAhead: [],
    acceptedIdx: -1,
    lastBarTime: 0,
    events: [],
    realizedPoints: 0,
    legRealized: 0,
    mfe: 0,
    mae: 0,
    mfeTime: 0,
    completedLegs: [],
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

/** Pick a long entry given a candidate support pool (highest-first-tagged). */
function pickLongEntry(pool: Level[], bar: Bar): Level | null {
  // Highest support with open >= level >= low (first tag from above).
  const sortedDesc = [...pool].sort((a, b) => b.price - a.price);
  for (const lv of sortedDesc) {
    if (bar.low <= lv.price && bar.open >= lv.price) return lv;
  }
  // Fallback: gap-through — highest support with low <= level.
  for (const lv of sortedDesc) {
    if (bar.low <= lv.price) return lv;
  }
  return null;
}

/** Pick a short entry given a candidate resistance pool (lowest-first-tagged). */
function pickShortEntry(pool: Level[], bar: Bar): Level | null {
  const sortedAsc = [...pool].sort((a, b) => a.price - b.price);
  for (const lv of sortedAsc) {
    if (bar.high >= lv.price && bar.open <= lv.price) return lv;
  }
  for (const lv of sortedAsc) {
    if (bar.high >= lv.price) return lv;
  }
  return null;
}

/** Advance the state by a single bar. Returns the updated state (no mutation). */
export function advance(state: TradeState, plan: DailyPlanRow, bar: Bar): TradeState {
  // Terminal phases block only in directional mode. Neutral re-arms.
  if (state.phase === "disabled") return state;
  if (state.mode === "directional" && (state.phase === "stopped" || state.phase === "closed_win")) return state;
  if (bar.time <= state.lastBarTime) return state;
  if (!isRthBar(bar.time)) return { ...state, lastBarTime: bar.time };
  if (etDateKey(bar.time) !== state.planDate) return { ...state, lastBarTime: bar.time };

  const ladder = buildLadder(plan);
  let s: TradeState = { ...state, lastBarTime: bar.time, events: state.events };

  // --------- Entry ---------
  if (s.phase === "armed") {
    let entryLevel: Level | null = null;
    let chosenSide: Side | null = null;

    if (s.mode === "directional") {
      const isLong = s.side === "long";
      const pool = isLong ? supportLevels(ladder) : resistanceLevels(ladder);
      entryLevel = isLong ? pickLongEntry(pool, bar) : pickShortEntry(pool, bar);
      chosenSide = isLong ? "long" : "short";
    } else {
      // Neutral: only T2/T3 zones per side, gated by armSide.
      const wantLong = s.armSide === "long" || s.armSide === "either";
      const wantShort = s.armSide === "short" || s.armSide === "either";
      const longPick = wantLong ? pickLongEntry(neutralLongEntries(ladder), bar) : null;
      const shortPick = wantShort ? pickShortEntry(neutralShortEntries(ladder), bar) : null;
      if (longPick && shortPick) {
        // Same bar — pick the level closer to bar.open (first-tagged given bar direction).
        const dLong = Math.abs(bar.open - longPick.price);
        const dShort = Math.abs(bar.open - shortPick.price);
        if (dLong <= dShort) { entryLevel = longPick; chosenSide = "long"; }
        else { entryLevel = shortPick; chosenSide = "short"; }
      } else if (longPick) { entryLevel = longPick; chosenSide = "long"; }
      else if (shortPick) { entryLevel = shortPick; chosenSide = "short"; }
    }

    if (!entryLevel || !chosenSide) return s;

    const isLong = chosenSide === "long";
    let stop: number | undefined;
    let stopLabel: string | undefined;
    if (isLong) {
      const below = levelBelow(ladder, entryLevel.label);
      if (below) { stop = below.price; stopLabel = below.label; }
      else { stop = entryLevel.price - upsideAvgSpacing(ladder); stopLabel = "extension"; }
    } else {
      const above = levelAbove(ladder, entryLevel.label);
      if (above) { stop = above.price; stopLabel = above.label; }
      else { stop = entryLevel.price + downsideAvgSpacing(ladder); stopLabel = "extension"; }
    }

    const ahead = isLong
      ? levelsAbove(ladder, entryLevel.label)
      : levelsBelow(ladder, entryLevel.label);

    s = {
      ...s,
      phase: "in_trade",
      side: chosenSide,
      contracts: CONTRACTS,
      scaled: 0,
      entry: entryLevel.price,
      entryLabel: entryLevel.label,
      entryTime: bar.time,
      stop,
      stopLabel,
      ladderAhead: ahead,
      acceptedIdx: -1,
      legRealized: 0,
      mfe: 0,
      mae: 0,
      mfeTime: bar.time,
      events: [
        ...s.events,
        {
          kind: "entry",
          time: bar.time,
          price: entryLevel.price,
          label: entryLevel.label,
          note: `${isLong ? "LONG" : "SHORT"} ${CONTRACTS}x @ ${entryLevel.price.toFixed(2)} (${entryLevel.label}) — stop ${stop.toFixed(2)} (${stopLabel ?? "?"})`,
        },
      ],
    };
    // Fall through — same bar may already scale/stop.
  }

  if (s.phase !== "in_trade") return s;

  const isLong = s.side === "long";

  // --------- Excursion tracking (before the stop check, so a bar that runs
  // up and then stops out still records the run-up) ---------
  if (s.entry != null) {
    const favorable = isLong ? bar.high - s.entry : s.entry - bar.low;
    const adverse = isLong ? bar.low - s.entry : s.entry - bar.high;
    const prevMfe = s.mfe ?? 0;
    if (favorable > prevMfe) s = { ...s, mfe: favorable, mfeTime: bar.time };
    if (adverse < (s.mae ?? 0)) s = { ...s, mae: adverse };
  }


  // --------- Stop-out ---------
  const stopHit = s.stop != null && (isLong ? bar.low <= s.stop : bar.high >= s.stop);
  if (stopHit && s.stop != null) {
    const exitPx = s.stop;
    const perContract = isLong ? (exitPx - (s.entry ?? exitPx)) : ((s.entry ?? exitPx) - exitPx);
    const legDelta = perContract * s.contracts;
    const legRealizedFinal = s.legRealized + legDelta;
    const cumRealized = s.realizedPoints + legDelta;
    const closingContracts = s.contracts;
    const legPhase: "closed_win" | "stopped" = legRealizedFinal >= 0 ? "closed_win" : "stopped";
    const events = [
      ...s.events,
      {
        kind: "stop_hit" as const,
        time: bar.time,
        price: exitPx,
        label: s.stopLabel,
        note: `Stop hit @ ${exitPx.toFixed(2)} — ${closingContracts}x closed`,
      },
      { kind: "closed" as const, time: bar.time, price: exitPx },
    ];
    return closeLeg(s, {
      exitPx,
      exitLabel: s.stopLabel,
      cumRealized,
      legRealizedFinal,
      legPhase,
      events,
      bar,
    });
  }

  // --------- Profit-direction acceptance sweep ---------
  const ahead = s.ladderAhead.slice();
  const scaleVerb = isLong ? "sold" : "covered";
  for (let i = s.acceptedIdx + 1; i < ahead.length; i++) {
    const lv = ahead[i];
    const touched = isLong ? bar.high >= lv.price : bar.low <= lv.price;
    if (!touched) break;

    const newEvents: TradeEvent[] = [];
    const perC = isLong ? (lv.price - (s.entry ?? lv.price)) : ((s.entry ?? lv.price) - lv.price);

    if (s.scaled === 0) {
      s.realizedPoints += perC;
      s.legRealized += perC;
      s.contracts -= 1;
      s.scaled = 1;
      s.stop = s.entry;
      s.stopLabel = "BE";
      newEvents.push({
        kind: "scale1",
        time: bar.time,
        price: lv.price,
        label: lv.label,
        note: `Scale-1: ${scaleVerb} 1 @ ${lv.price.toFixed(2)} (${lv.label}) · stop → BE ${s.entry!.toFixed(2)}`,
      });
    } else if (s.scaled === 1) {
      s.realizedPoints += perC;
      s.legRealized += perC;
      s.contracts -= 1;
      s.scaled = 2;
      s.stop = ahead[0].price;
      s.stopLabel = ahead[0].label;
      newEvents.push({
        kind: "scale2",
        time: bar.time,
        price: lv.price,
        label: lv.label,
        note: `Scale-2: ${scaleVerb} 1 @ ${lv.price.toFixed(2)} (${lv.label}) · stop → ${ahead[0].label} ${ahead[0].price.toFixed(2)}`,
      });
    } else {
      const prior = ahead[i - 1];
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

    // EXT1 append only in directional mode.
    const isFinalPublished = lv.label !== "EXT1" && i === ahead.length - 1;
    if (isFinalPublished && s.mode === "directional") {
      const e = isLong ? ext1Price(ladder) : ext1PriceShort(ladder);
      ahead.push({ price: e, label: "EXT1" });
      s.ext1 = e;
      newEvents.push({
        kind: "target_hit",
        time: bar.time,
        price: lv.price,
        label: lv.label,
        note: `Final target ${lv.label} accepted — EXT1 projected @ ${e.toFixed(2)}`,
      });
    }

    // EXT1 hit — close (directional only; neutral never appends EXT1).
    if (lv.label === "EXT1") {
      const runnerDelta = perC * s.contracts;
      s.realizedPoints += runnerDelta;
      s.legRealized += runnerDelta;
      newEvents.push({
        kind: "ext1_hit",
        time: bar.time,
        price: lv.price,
        note: `EXT1 hit @ ${lv.price.toFixed(2)} — runner closed`,
      });
      newEvents.push({ kind: "closed", time: bar.time, price: lv.price });
      s.events = [...s.events, ...newEvents];
      s.ladderAhead = ahead;
      return closeLeg(s, {
        exitPx: lv.price,
        exitLabel: lv.label,
        cumRealized: s.realizedPoints,
        legRealizedFinal: s.legRealized,
        legPhase: "closed_win",
        events: s.events,
        bar,
      });
    }

    s.events = [...s.events, ...newEvents];
  }

  s.ladderAhead = ahead;
  return s;
}

// -------- Leg close helper --------
// Directional: sets terminal phase. Neutral: pushes leg + re-arms opposite side.
function closeLeg(
  s: TradeState,
  args: {
    exitPx: number;
    exitLabel?: string;
    cumRealized: number;
    legRealizedFinal: number;
    legPhase: "closed_win" | "stopped";
    events: TradeEvent[];
    bar: Bar;
  },
): TradeState {
  const { exitPx, exitLabel, cumRealized, legRealizedFinal, legPhase, events, bar } = args;

  const leg: CompletedLeg | null = s.side && s.entry != null && s.entryLabel && s.entryTime != null
    ? {
        side: s.side,
        entry: s.entry,
        entryLabel: s.entryLabel,
        entryTime: s.entryTime,
        exit: exitPx,
        exitLabel,
        exitTime: bar.time,
        phase: legPhase,
        realized: legRealizedFinal,
        mfe: s.mfe ?? 0,
        mae: s.mae ?? 0,
        mfeTime: s.mfeTime ?? s.entryTime,
      }
    : null;

  if (s.mode === "directional") {
    return {
      ...s,
      phase: legPhase,
      contracts: 0,
      realizedPoints: cumRealized,
      legRealized: legRealizedFinal,
      completedLegs: leg ? [...s.completedLegs, leg] : s.completedLegs,
      events,
    };
  }

  // Neutral: re-arm opposite side.
  const opposite: ArmSide = s.side === "long" ? "short" : s.side === "short" ? "long" : "either";
  const reArmNote = `Leg closed ${legRealizedFinal >= 0 ? "+" : ""}${legRealizedFinal.toFixed(2)} pts · re-arm for ${opposite.toUpperCase()} at ${opposite === "short" ? "T2↑/T3↑" : "T2↓/T3↓"}`;
  return {
    ...s,
    phase: "armed",
    side: undefined,
    armSide: opposite,
    contracts: CONTRACTS,
    scaled: 0,
    entry: undefined,
    entryLabel: undefined,
    entryTime: undefined,
    stop: undefined,
    stopLabel: undefined,
    ladderAhead: [],
    acceptedIdx: -1,
    ext1: undefined,
    realizedPoints: cumRealized,
    legRealized: 0,
    completedLegs: leg ? [...s.completedLegs, leg] : s.completedLegs,
    events: [
      ...events,
      { kind: "leg_closed", time: bar.time, price: exitPx, note: reArmNote },
    ],
  };
}

export function replay(state: TradeState, plan: DailyPlanRow, bars: Bar[]): TradeState {
  let s = state;
  for (const b of bars) {
    s = advance(s, plan, b);
    if (s.mode === "directional" && (s.phase === "stopped" || s.phase === "closed_win")) break;
  }
  return s;
}
