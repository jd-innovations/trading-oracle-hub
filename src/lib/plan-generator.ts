// Pure plan-generation logic. Consumes 1m–2m RTH-inclusive bars (UTC seconds)
// for the ES futures contract and emits a structured Daily Plan.
//
// Business rules (per user spec):
//   pivot = prior RTH session POC
//   T1↑   = prior VAH         T1↓   = prior VAL
//   T2↑   = prior session High T2↓   = prior session Low
//   T3↑   = priorHigh + (VAH−VAL)
//   T3↓   = priorLow  − (VAH−VAL)
//   bias  = close > VAH → Bullish, close < VAL → Bearish, else Neutral
//   naked30mPocs = unvisited 30-minute POCs from the prior RTH session

const TICK = 0.25;
const BRACKET_MIN = 30;
const VA_PCT = 0.7;
const RTH_START_MIN = 9 * 60 + 30;
const RTH_END_MIN = 16 * 60;
const ET_OFFSET_HOURS = 4; // EDT; close enough for session bucketing year-round

interface Bar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

function etMinutesOfDay(t: number): number {
  const d = new Date(t * 1000);
  const h = (d.getUTCHours() - ET_OFFSET_HOURS + 24) % 24;
  return h * 60 + d.getUTCMinutes();
}
function etDateKey(t: number): string {
  const d = new Date((t - ET_OFFSET_HOURS * 3600) * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
function isRth(t: number): boolean {
  const m = etMinutesOfDay(t);
  return m >= RTH_START_MIN && m < RTH_END_MIN;
}
function roundTick(p: number): number {
  return Math.round(p / TICK) * TICK;
}

function groupRthSessions(bars: Bar[]): { key: string; bars: Bar[] }[] {
  const map = new Map<string, Bar[]>();
  for (const b of bars) {
    if (!isRth(b.time)) continue;
    const k = etDateKey(b.time);
    let arr = map.get(k);
    if (!arr) { arr = []; map.set(k, arr); }
    arr.push(b);
  }
  return [...map.entries()].map(([key, bars]) => ({ key, bars })).sort((a, b) => a.key.localeCompare(b.key));
}

function computeTpo(bars: Bar[]): { poc: number; vah: number; val: number } | null {
  if (!bars.length) return null;
  const buckets = new Map<number, Set<number>>(); // priceBin -> bracket indexes
  for (const b of bars) {
    const bracket = Math.floor((etMinutesOfDay(b.time) - RTH_START_MIN) / BRACKET_MIN);
    const lo = Math.round(b.low / TICK);
    const hi = Math.round(b.high / TICK);
    for (let p = lo; p <= hi; p++) {
      let s = buckets.get(p);
      if (!s) { s = new Set(); buckets.set(p, s); }
      s.add(bracket);
    }
  }
  if (!buckets.size) return null;
  const rows = [...buckets.entries()].map(([bin, set]) => ({ bin, count: set.size }));
  rows.sort((a, b) => a.bin - b.bin);
  const total = rows.reduce((s, r) => s + r.count, 0);
  const target = total * VA_PCT;
  let pocIdx = 0;
  for (let i = 1; i < rows.length; i++) if (rows[i].count > rows[pocIdx].count) pocIdx = i;
  let lo = pocIdx, hi = pocIdx, acc = rows[pocIdx].count;
  while (acc < target && (lo > 0 || hi < rows.length - 1)) {
    const up = hi + 1 <= rows.length - 1 ? (rows[hi + 1]?.count ?? 0) + (rows[hi + 2]?.count ?? 0) : -1;
    const dn = lo - 1 >= 0 ? (rows[lo - 1]?.count ?? 0) + (rows[lo - 2]?.count ?? 0) : -1;
    if (up >= dn && hi < rows.length - 1) { hi++; acc += rows[hi].count; }
    else if (lo > 0) { lo--; acc += rows[lo].count; }
    else break;
  }
  return {
    poc: rows[pocIdx].bin * TICK,
    vah: rows[hi].bin * TICK,
    val: rows[lo].bin * TICK,
  };
}

function compute30mPocs(bars: Bar[]): { time: number; price: number }[] {
  const groups = new Map<number, Bar[]>();
  for (const b of bars) {
    const bucket = Math.floor((etMinutesOfDay(b.time) - RTH_START_MIN) / BRACKET_MIN);
    if (bucket < 0) continue;
    let arr = groups.get(bucket);
    if (!arr) { arr = []; groups.set(bucket, arr); }
    arr.push(b);
  }
  const out: { time: number; price: number }[] = [];
  for (const [, arr] of groups) {
    if (!arr.length) continue;
    const counts = new Map<number, number>();
    for (const b of arr) {
      const lo = Math.round(b.low / TICK), hi = Math.round(b.high / TICK);
      for (let p = lo; p <= hi; p++) counts.set(p, (counts.get(p) ?? 0) + 1);
    }
    let bestBin = 0, bestC = -1;
    for (const [bin, c] of counts) if (c > bestC) { bestC = c; bestBin = bin; }
    out.push({ time: arr[0].time, price: bestBin * TICK });
  }
  return out;
}

export interface GeneratedPlan {
  planDate: string; // YYYY-MM-DD (today, ET)
  bias: "Bullish" | "Bearish" | "Neutral";
  pivot: number;
  t1Up: number; t2Up: number; t3Up: number;
  t1Dn: number; t2Dn: number; t3Dn: number;
  priorHigh: number;
  priorLow: number;
  priorClose: number;
  priorPoc: number;
  priorVah: number;
  priorVal: number;
  /** Unvisited 30m POCs from the prior RTH session (price asc). */
  naked30mPocs: number[];
  context: string;
}

export function generatePlanFromBars(bars: Bar[]): GeneratedPlan | null {
  const sessions = groupRthSessions(bars);
  if (sessions.length < 1) return null;
  const prior = sessions[sessions.length - 1];
  const tpo = computeTpo(prior.bars);
  if (!tpo) return null;

  const priorHigh = Math.max(...prior.bars.map(b => b.high));
  const priorLow = Math.min(...prior.bars.map(b => b.low));
  const priorClose = prior.bars[prior.bars.length - 1].close;
  const vaRange = tpo.vah - tpo.val;

  // Naked 30m POCs: not touched (high>=p && low<=p) by any later bar in the session.
  const pocs = compute30mPocs(prior.bars);
  const naked: number[] = [];
  for (const p of pocs) {
    const later = prior.bars.filter(b => b.time > p.time + BRACKET_MIN * 60);
    const touched = later.some(b => b.high >= p.price && b.low <= p.price);
    if (!touched) naked.push(roundTick(p.price));
  }
  naked.sort((a, b) => a - b);

  const bias: GeneratedPlan["bias"] =
    priorClose > tpo.vah ? "Bullish" : priorClose < tpo.val ? "Bearish" : "Neutral";

  // Next ET date (the plan is for *today*, which is the session after prior).
  const planDate = new Date().toISOString().slice(0, 10);

  const biasNote =
    bias === "Bullish"
      ? `Prior close ${priorClose.toFixed(2)} accepted above VAH ${tpo.vah.toFixed(2)} — lean long while above pivot.`
      : bias === "Bearish"
        ? `Prior close ${priorClose.toFixed(2)} rejected below VAL ${tpo.val.toFixed(2)} — lean short while below pivot.`
        : `Prior close ${priorClose.toFixed(2)} settled inside value (${tpo.val.toFixed(2)}–${tpo.vah.toFixed(2)}) — rotational until breakout.`;
  const nakedNote = naked.length
    ? ` Naked 30m POCs from prior session as magnets: ${naked.slice(0, 4).map(p => p.toFixed(2)).join(", ")}.`
    : "";

  return {
    planDate,
    bias,
    pivot: roundTick(tpo.poc),
    t1Up: roundTick(tpo.vah),
    t2Up: roundTick(priorHigh),
    t3Up: roundTick(priorHigh + vaRange),
    t1Dn: roundTick(tpo.val),
    t2Dn: roundTick(priorLow),
    t3Dn: roundTick(priorLow - vaRange),
    priorHigh: roundTick(priorHigh),
    priorLow: roundTick(priorLow),
    priorClose: roundTick(priorClose),
    priorPoc: roundTick(tpo.poc),
    priorVah: roundTick(tpo.vah),
    priorVal: roundTick(tpo.val),
    naked30mPocs: naked,
    context: biasNote + nakedNote,
  };
}
