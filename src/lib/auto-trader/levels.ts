// Ladder helpers for the auto-trader. Pure functions.
import type { DailyPlanRow } from "@/lib/plans.functions";

export interface Level {
  price: number;
  label: string; // "T3↓" | "T2↓" | "T1↓" | "Pivot" | "T1↑" | "T2↑" | "T3↑" | "EXT1"
}

/** Full published ladder ascending: T3↓ … Pivot … T3↑. */
export function buildLadder(plan: Pick<DailyPlanRow, "pivot" | "t1_up" | "t2_up" | "t3_up" | "t1_dn" | "t2_dn" | "t3_dn">): Level[] {
  return [
    { price: Number(plan.t3_dn), label: "T3↓" },
    { price: Number(plan.t2_dn), label: "T2↓" },
    { price: Number(plan.t1_dn), label: "T1↓" },
    { price: Number(plan.pivot), label: "Pivot" },
    { price: Number(plan.t1_up), label: "T1↑" },
    { price: Number(plan.t2_up), label: "T2↑" },
    { price: Number(plan.t3_up), label: "T3↑" },
  ].sort((a, b) => a.price - b.price);
}

/** Support levels for LONG entries — Pivot and below. */
export function supportLevels(ladder: Level[]): Level[] {
  const pivotIdx = ladder.findIndex((l) => l.label === "Pivot");
  return ladder.slice(0, pivotIdx + 1); // T3↓ … Pivot
}

/** Levels strictly above an entry level, in ascending order. */
export function levelsAbove(ladder: Level[], entryLabel: string): Level[] {
  const i = ladder.findIndex((l) => l.label === entryLabel);
  if (i < 0) return [];
  return ladder.slice(i + 1);
}

/** One published level below the entry, for the initial stop. */
export function levelBelow(ladder: Level[], entryLabel: string): Level | null {
  const i = ladder.findIndex((l) => l.label === entryLabel);
  if (i <= 0) return null;
  return ladder[i - 1];
}

/** Average spacing between adjacent upside published levels (Pivot→T3↑). */
export function upsideAvgSpacing(ladder: Level[]): number {
  const pivotIdx = ladder.findIndex((l) => l.label === "Pivot");
  const up = ladder.slice(pivotIdx); // Pivot..T3↑
  if (up.length < 2) return 0;
  let sum = 0;
  for (let i = 1; i < up.length; i++) sum += up[i].price - up[i - 1].price;
  return sum / (up.length - 1);
}

/** EXT1 target = final published upside + avg spacing. */
export function ext1Price(ladder: Level[]): number {
  const last = ladder[ladder.length - 1];
  return last.price + upsideAvgSpacing(ladder);
}
