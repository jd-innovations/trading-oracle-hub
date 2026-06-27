// Compute Daily Plan results by comparing plan targets to actual RTH bars.
import type { Candle } from "./chart-utils";

const ET_OFFSET_HOURS = 4; // EDT — close enough for session bucketing
const RTH_START_MIN = 9 * 60 + 30;
const RTH_END_MIN = 16 * 60;

function etMinutesOfDay(t: number): number {
  const d = new Date(t * 1000);
  const h = (d.getUTCHours() - ET_OFFSET_HOURS + 24) % 24;
  return h * 60 + d.getUTCMinutes();
}
function etDateKey(t: number): string {
  const d = new Date((t - ET_OFFSET_HOURS * 3600) * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
function fmtHHMM(t: number): string {
  const m = etMinutesOfDay(t);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export interface TargetHit { price: number; hit: boolean; time?: string }
export interface PlanResultComputed {
  date: string;
  bias: "Bullish" | "Bearish" | "Neutral";
  biasHit: boolean;
  pivot: number;
  pivotHeld: boolean;
  ups: [TargetHit, TargetHit, TargetHit];
  dns: [TargetHit, TargetHit, TargetHit];
  open: number;
  high: number;
  low: number;
  close: number;
  score: number;
  barsCount: number;
}

export interface PlanInput {
  date: string; // YYYY-MM-DD (ET) — the session being graded
  bias: "Bullish" | "Bearish" | "Neutral";
  pivot: number;
  t1Up: number; t2Up: number; t3Up: number;
  t1Dn: number; t2Dn: number; t3Dn: number;
}

export function computePlanResults(plan: PlanInput, bars: Candle[]): PlanResultComputed | null {
  const session = bars.filter((b) => {
    if (etDateKey(b.time) !== plan.date) return false;
    const m = etMinutesOfDay(b.time);
    return m >= RTH_START_MIN && m < RTH_END_MIN;
  }).sort((a, b) => a.time - b.time);
  if (!session.length) return null;

  const open = session[0].open;
  const close = session[session.length - 1].close;
  const high = Math.max(...session.map((b) => b.high));
  const low = Math.min(...session.map((b) => b.low));

  const hitUp = (price: number): TargetHit => {
    const bar = session.find((b) => b.high >= price);
    return bar ? { price, hit: true, time: fmtHHMM(bar.time) } : { price, hit: false };
  };
  const hitDn = (price: number): TargetHit => {
    const bar = session.find((b) => b.low <= price);
    return bar ? { price, hit: true, time: fmtHHMM(bar.time) } : { price, hit: false };
  };

  const ups: [TargetHit, TargetHit, TargetHit] = [hitUp(plan.t1Up), hitUp(plan.t2Up), hitUp(plan.t3Up)];
  const dns: [TargetHit, TargetHit, TargetHit] = [hitDn(plan.t1Dn), hitDn(plan.t2Dn), hitDn(plan.t3Dn)];

  // Bias hit: close on the correct side of pivot (or inside ±0.1% for Neutral).
  const tol = plan.pivot * 0.001;
  const biasHit =
    plan.bias === "Bullish" ? close > plan.pivot
    : plan.bias === "Bearish" ? close < plan.pivot
    : Math.abs(close - plan.pivot) <= tol;

  // Pivot held: price traded through pivot (touched) AND closed within ±0.25% — i.e. acted as magnet.
  const traded = session.some((b) => b.low <= plan.pivot && b.high >= plan.pivot);
  const pivotHeld = traded && Math.abs(close - plan.pivot) <= plan.pivot * 0.0025;

  // Score: 10 per target hit (60), 20 bias, 20 pivot held.
  const tgtHits = [...ups, ...dns].filter((t) => t.hit).length;
  const score = tgtHits * 10 + (biasHit ? 20 : 0) + (pivotHeld ? 20 : 0);

  return {
    date: plan.date,
    bias: plan.bias,
    biasHit,
    pivot: plan.pivot,
    pivotHeld,
    ups,
    dns,
    open,
    high,
    low,
    close,
    score,
    barsCount: session.length,
  };
}
