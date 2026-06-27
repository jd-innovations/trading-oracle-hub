// Pure plan-generation logic. Consumes 1m–2m RTH-inclusive bars (UTC seconds)
// for the ES futures contract and emits a structured Daily Plan.
//
// Business rules (per user spec):
//   pivot = closest structural reference from prior RTH profile
//           ({VAH, POC, VAL}) to the anchor price (current/opening price
//           at plan-generation time, default = last available bar's close).
//   Upside targets = remaining structural levels above pivot, sorted asc:
//           candidates {VAH, POC, VAL, priorHigh}, then extension priorHigh + VA range.
//   Downside targets = remaining structural levels below pivot, sorted desc:
//           candidates {VAH, POC, VAL, priorLow}, then extension priorLow − VA range.
//   bias  = anchor > VAH → Bullish, anchor < VAL → Bearish, else Neutral
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

export function generatePlanFromBars(bars: Bar[], anchorPrice?: number): GeneratedPlan | null {
  const sessions = groupRthSessions(bars);
  if (sessions.length < 1) return null;
  const prior = sessions[sessions.length - 1];
  const tpo = computeTpo(prior.bars);
  if (!tpo) return null;

  const priorHigh = Math.max(...prior.bars.map(b => b.high));
  const priorLow = Math.min(...prior.bars.map(b => b.low));
  const priorClose = prior.bars[prior.bars.length - 1].close;
  const vaRange = tpo.vah - tpo.val;

  // Anchor = latest bar close (closest proxy to 8:30 ET plan time)
  // unless caller passes an explicit live price.
  const anchor = anchorPrice ?? bars[bars.length - 1].close;

  // Naked 30m POCs
  const pocs = compute30mPocs(prior.bars);
  const naked: number[] = [];
  for (const p of pocs) {
    const later = prior.bars.filter(b => b.time > p.time + BRACKET_MIN * 60);
    const touched = later.some(b => b.high >= p.price && b.low <= p.price);
    if (!touched) naked.push(roundTick(p.price));
  }
  naked.sort((a, b) => a - b);

  // Pivot = closest of {VAH, POC, VAL} to anchor
  const structural: Array<{ name: "VAH" | "POC" | "VAL"; price: number }> = [
    { name: "VAH", price: tpo.vah },
    { name: "POC", price: tpo.poc },
    { name: "VAL", price: tpo.val },
  ];
  const pivotRef = structural.reduce((best, cur) =>
    Math.abs(cur.price - anchor) < Math.abs(best.price - anchor) ? cur : best,
  );
  const pivot = roundTick(pivotRef.price);

  // Build target candidates above/below pivot from structural + prior H/L.
  const allLevels = [
    ...structural.filter(s => s.name !== pivotRef.name).map(s => s.price),
    priorHigh,
    priorLow,
  ];
  const uniq = (xs: number[]) => [...new Set(xs.map(roundTick))];
  const above = uniq(allLevels.filter(p => p > pivot)).sort((a, b) => a - b);
  const below = uniq(allLevels.filter(p => p < pivot)).sort((a, b) => b - a);

  const extUp = roundTick(priorHigh + vaRange);
  const extDn = roundTick(priorLow - vaRange);
  const pickUp = [...above, extUp].filter((p, i, arr) => arr.indexOf(p) === i);
  const pickDn = [...below, extDn].filter((p, i, arr) => arr.indexOf(p) === i);
  const t1Up = pickUp[0] ?? extUp;
  const t2Up = pickUp[1] ?? extUp;
  const t3Up = pickUp[2] ?? extUp;
  const t1Dn = pickDn[0] ?? extDn;
  const t2Dn = pickDn[1] ?? extDn;
  const t3Dn = pickDn[2] ?? extDn;

  const bias: GeneratedPlan["bias"] =
    anchor > tpo.vah ? "Bullish" : anchor < tpo.val ? "Bearish" : "Neutral";

  const planDate = new Date().toISOString().slice(0, 10);

  const biasNote =
    bias === "Bullish"
      ? `Anchor ${anchor.toFixed(2)} above prior VAH ${tpo.vah.toFixed(2)} — lean long while holding pivot ${pivot.toFixed(2)} (${pivotRef.name}).`
      : bias === "Bearish"
        ? `Anchor ${anchor.toFixed(2)} below prior VAL ${tpo.val.toFixed(2)} — lean short while capped by pivot ${pivot.toFixed(2)} (${pivotRef.name}).`
        : `Anchor ${anchor.toFixed(2)} inside prior value (${tpo.val.toFixed(2)}–${tpo.vah.toFixed(2)}) — rotational around pivot ${pivot.toFixed(2)} (${pivotRef.name}).`;
  const nakedNote = naked.length
    ? ` Naked 30m POCs as magnets: ${naked.slice(0, 4).map(p => p.toFixed(2)).join(", ")}.`
    : "";

  return {
    planDate,
    bias,
    pivot,
    t1Up, t2Up, t3Up,
    t1Dn, t2Dn, t3Dn,
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

