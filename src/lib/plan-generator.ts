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


const DEFAULT_TICK = 0.25;
const DEFAULT_MIN_GAP = 8;
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
function roundTickBy(p: number, tick: number): number {
  return Math.round(p / tick) * tick;
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

  // Scan the last 25 RTH sessions for (a) naked 30m POCs and
  // (b) naked structural references (H/L/VAH/POC/VAL). A level is "naked"
  // if no subsequent bar (later session OR same session after it was set)
  // has traded through it.
  const LOOKBACK = 25;
  const window = sessions.slice(-LOOKBACK);

  // Pre-compute later-bar arrays per session index for touch tests.
  const laterBarsByIdx: Bar[][] = [];
  for (let i = 0; i < window.length; i++) {
    const later: Bar[] = [];
    for (let j = i + 1; j < window.length; j++) later.push(...window[j].bars);
    laterBarsByIdx.push(later);
  }
  const touched = (price: number, sessBars: Bar[], afterTime: number, laterBars: Bar[]) => {
    if (sessBars.some(b => b.time > afterTime && b.high >= price && b.low <= price)) return true;
    if (laterBars.some(b => b.high >= price && b.low <= price)) return true;
    return false;
  };

  const nakedPocs30m: number[] = [];
  type StructRef = { price: number; kind: "H" | "L" | "VAH" | "POC" | "VAL"; sessionKey: string };
  const nakedStructs: StructRef[] = [];

  for (let i = 0; i < window.length; i++) {
    const sess = window[i];
    const laterBars = laterBarsByIdx[i];
    const sessEnd = sess.bars[sess.bars.length - 1].time;

    // 30m POCs
    for (const p of compute30mPocs(sess.bars)) {
      if (touched(p.price, sess.bars, p.time + BRACKET_MIN * 60, laterBars)) continue;
      nakedPocs30m.push(roundTick(p.price));
    }

    // Session structural levels (H/L only naked vs LATER sessions;
    // VAH/POC/VAL of a session can only be evaluated after the session closes).
    const hi = Math.max(...sess.bars.map(b => b.high));
    const lo = Math.min(...sess.bars.map(b => b.low));
    if (!laterBars.some(b => b.high >= hi && b.low <= hi)) {
      nakedStructs.push({ price: roundTick(hi), kind: "H", sessionKey: sess.key });
    }
    if (!laterBars.some(b => b.high >= lo && b.low <= lo)) {
      nakedStructs.push({ price: roundTick(lo), kind: "L", sessionKey: sess.key });
    }
    const sessTpo = computeTpo(sess.bars);
    if (sessTpo) {
      for (const [kind, price] of [
        ["VAH", sessTpo.vah],
        ["POC", sessTpo.poc],
        ["VAL", sessTpo.val],
      ] as const) {
        // VAH/POC/VAL are evaluated only by LATER sessions (level is defined
        // by the entire session, so same-session intra-touches don't count).
        if (!laterBars.some(b => b.high >= price && b.low <= price)) {
          nakedStructs.push({ price: roundTick(price), kind, sessionKey: sess.key });
        }
      }
      void sessEnd;
    }
  }
  const nakedUniq = [...new Set(nakedPocs30m)].sort((a, b) => a - b);

  // Pivot = closest of TODAY's prior-session {VAH, POC, VAL} to anchor.
  const structural: Array<{ name: "VAH" | "POC" | "VAL"; price: number }> = [
    { name: "VAH", price: tpo.vah },
    { name: "POC", price: tpo.poc },
    { name: "VAL", price: tpo.val },
  ];
  const pivotRef = structural.reduce((best, cur) =>
    Math.abs(cur.price - anchor) < Math.abs(best.price - anchor) ? cur : best,
  );
  const pivot = roundTick(pivotRef.price);

  // Full structural candidate pool — every naked level across the 25-session
  // window plus today's prior-session refs. Naked 30m POCs included.
  const structuralPool = [
    ...structural.filter(s => s.name !== pivotRef.name).map(s => s.price),
    priorHigh,
    priorLow,
    ...nakedStructs.map(s => s.price),
    ...nakedUniq,
  ];
  const uniq = (xs: number[]) => [...new Set(xs.map(roundTick))];
  const MIN_GAP = 8; // points — minimum spacing between pivot/targets
  const above = uniq(structuralPool.filter(p => p > pivot)).sort((a, b) => a - b);
  const below = uniq(structuralPool.filter(p => p < pivot)).sort((a, b) => b - a);


  function pickTargets(structuralCandidates: number[], dir: 1 | -1): number[] {
    const out: number[] = [];
    let prev = pivot;
    // 1) Walk structural candidates first.
    for (const p of structuralCandidates) {
      if (Math.abs(p - prev) >= MIN_GAP) {
        out.push(p);
        prev = p;
        if (out.length === 3) return out;
      }
    }
    // 2) Only when structural pool is exhausted, fall back to extensions
    //    of the prior High/Low using 0.25× VA increments. Step the multiplier
    //    until the new target is at least MIN_GAP from the previous level.
    const base = dir === 1 ? priorHigh : priorLow;
    let mult = 0.25;
    while (out.length < 3) {
      const candidate = roundTick(base + dir * vaRange * mult);
      if ((dir === 1 ? candidate > prev : candidate < prev) && Math.abs(candidate - prev) >= MIN_GAP) {
        out.push(candidate);
        prev = candidate;
        mult += 0.25;
      } else {
        mult += 0.25;
        if (mult > 6) break; // safety
      }
    }
    return out;
  }

  const [t1Up, t2Up, t3Up] = pickTargets(above, 1);
  const [t1Dn, t2Dn, t3Dn] = pickTargets(below, -1);

  const bias: GeneratedPlan["bias"] =
    anchor > tpo.vah ? "Bullish" : anchor < tpo.val ? "Bearish" : "Neutral";

  const planDate = new Date().toISOString().slice(0, 10);

  const biasNote =
    bias === "Bullish"
      ? `Anchor ${anchor.toFixed(2)} above prior VAH ${tpo.vah.toFixed(2)} — lean long while holding pivot ${pivot.toFixed(2)} (${pivotRef.name}).`
      : bias === "Bearish"
        ? `Anchor ${anchor.toFixed(2)} below prior VAL ${tpo.val.toFixed(2)} — lean short while capped by pivot ${pivot.toFixed(2)} (${pivotRef.name}).`
        : `Anchor ${anchor.toFixed(2)} inside prior value (${tpo.val.toFixed(2)}–${tpo.vah.toFixed(2)}) — rotational around pivot ${pivot.toFixed(2)} (${pivotRef.name}).`;
  const nakedNote = nakedUniq.length
    ? ` Naked 30m POCs (last ${LOOKBACK} sess) as magnets: ${nakedUniq.slice(0, 6).map(p => p.toFixed(2)).join(", ")}.`
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
    naked30mPocs: nakedUniq,
    context: biasNote + nakedNote,
  };
}

