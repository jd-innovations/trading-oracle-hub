// RTH market profile levels — TPO POC / VAH / VAL, single prints, poor H/L,
// plus per-30m POCs. Pure logic. Each level is a horizontal ray extended
// until a later bar trades through the price.

const TICK = 0.25;
const BRACKET_MIN = 30;
const VA_PCT = 0.7;
const POOR_TICKS = 2; // poor high/low: ≥2 brackets within this many ticks
const RTH_START_MIN = 9 * 60 + 30;
const RTH_END_MIN = 16 * 60;
const ET_OFFSET_HOURS = 4;

export type ProfileLevelKind =
  | "poc"
  | "vah"
  | "val"
  | "single"
  | "poorHigh"
  | "poorLow"
  | "poc30m";

export interface ProfileLevel {
  kind: ProfileLevelKind;
  price: number;
  startTime: number;
  endTime: number;
  label: string;
  color: string;
  /** Drawing weight hint. */
  weight: number;
  broken: boolean;
}

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

// Theme-aligned hex colors (resolved via toRgb at draw time elsewhere).
const COLOR_POC = "#eab308";
const COLOR_VAH = "#22c55e";
const COLOR_VAL = "#ef4444";
const COLOR_SINGLE = "#94a3b8";
const COLOR_POOR = "#f97316";
const COLOR_POC30M = "#38bdf8";

function etMinutesOfDay(timeSec: number): number {
  const d = new Date(timeSec * 1000);
  const hour = (d.getUTCHours() - ET_OFFSET_HOURS + 24) % 24;
  return hour * 60 + d.getUTCMinutes();
}

function etDateKey(timeSec: number): string {
  const shifted = new Date((timeSec - ET_OFFSET_HOURS * 3600) * 1000);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
}

function formatDayLabel(timeSec: number): string {
  const shifted = new Date((timeSec - ET_OFFSET_HOURS * 3600) * 1000);
  return `${String(shifted.getUTCMonth() + 1).padStart(2, "0")}/${String(shifted.getUTCDate()).padStart(2, "0")}`;
}

function formatTimeLabel(timeSec: number): string {
  const m = etMinutesOfDay(timeSec);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function priceToBin(p: number): number {
  return Math.round(p / TICK);
}

function isRth(timeSec: number): boolean {
  const m = etMinutesOfDay(timeSec);
  return m >= RTH_START_MIN && m < RTH_END_MIN;
}

interface Session {
  dayKey: string;
  bars: Candle[];
  start: number;
  end: number;
}

function groupRthSessions(bars: Candle[]): Session[] {
  const map = new Map<string, Candle[]>();
  for (const b of bars) {
    if (!isRth(b.time)) continue;
    const k = etDateKey(b.time);
    let list = map.get(k);
    if (!list) {
      list = [];
      map.set(k, list);
    }
    list.push(b);
  }
  const out: Session[] = [];
  for (const [k, list] of map) {
    list.sort((a, b) => a.time - b.time);
    out.push({
      dayKey: k,
      bars: list,
      start: list[0].time,
      end: list[list.length - 1].time,
    });
  }
  out.sort((a, b) => a.start - b.start);
  return out;
}

interface TpoProfile {
  poc: number;
  vah: number;
  val: number;
  singles: number[];
  poorHigh: number | null;
  poorLow: number | null;
}

function computeTpoProfile(sessionBars: Candle[]): TpoProfile | null {
  if (!sessionBars.length) return null;
  const sessionStart = sessionBars[0].time;

  // bracketIdx -> Set of price bin indices touched in that bracket
  const brackets = new Map<number, Set<number>>();
  for (const bar of sessionBars) {
    const offset = bar.time - sessionStart;
    const bracketIdx = Math.floor(offset / (BRACKET_MIN * 60));
    let bins = brackets.get(bracketIdx);
    if (!bins) {
      bins = new Set();
      brackets.set(bracketIdx, bins);
    }
    const lo = priceToBin(bar.low);
    const hi = priceToBin(bar.high);
    for (let b = lo; b <= hi; b++) bins.add(b);
  }

  // TPO count per bin
  const tpoCount = new Map<number, number>();
  for (const bins of brackets.values()) {
    for (const b of bins) tpoCount.set(b, (tpoCount.get(b) ?? 0) + 1);
  }
  if (!tpoCount.size) return null;

  const allBins = [...tpoCount.keys()].sort((a, b) => a - b);
  const minBin = allBins[0];
  const maxBin = allBins[allBins.length - 1];
  const mid = (minBin + maxBin) / 2;

  // POC — most touched (tie: closest to mid)
  let pocBin = minBin;
  let maxCount = 0;
  for (const [bin, count] of tpoCount) {
    if (
      count > maxCount ||
      (count === maxCount && Math.abs(bin - mid) < Math.abs(pocBin - mid))
    ) {
      maxCount = count;
      pocBin = bin;
    }
  }

  // 70% VA expansion (pair-step)
  const total = [...tpoCount.values()].reduce((a, b) => a + b, 0);
  const target = total * VA_PCT;
  let included = tpoCount.get(pocBin) ?? 0;
  let up = pocBin + 1;
  let dn = pocBin - 1;
  let vahBin = pocBin;
  let valBin = pocBin;
  while (included < target && (up <= maxBin || dn >= minBin)) {
    const upPair =
      (tpoCount.get(up) ?? 0) + (tpoCount.get(up + 1) ?? 0);
    const dnPair =
      (tpoCount.get(dn) ?? 0) + (tpoCount.get(dn - 1) ?? 0);
    if (up > maxBin && dn < minBin) break;
    if (up > maxBin) {
      included += tpoCount.get(dn) ?? 0;
      included += tpoCount.get(dn - 1) ?? 0;
      valBin = Math.min(valBin, dn - 1);
      dn -= 2;
    } else if (dn < minBin) {
      included += tpoCount.get(up) ?? 0;
      included += tpoCount.get(up + 1) ?? 0;
      vahBin = Math.max(vahBin, up + 1);
      up += 2;
    } else if (upPair >= dnPair) {
      included += upPair;
      vahBin = Math.max(vahBin, up + 1);
      up += 2;
    } else {
      included += dnPair;
      valBin = Math.min(valBin, dn - 1);
      dn -= 2;
    }
  }

  // Clamp VAH/VAL to actually touched bins
  vahBin = Math.min(vahBin, maxBin);
  valBin = Math.max(valBin, minBin);

  // Singles: bins with exactly 1 TPO, excluding session extremes
  const singles: number[] = [];
  for (const [bin, count] of tpoCount) {
    if (count === 1 && bin !== minBin && bin !== maxBin) {
      singles.push(bin * TICK);
    }
  }

  // Poor H/L: ≥2 brackets touching within POOR_TICKS of extreme
  let poorHigh: number | null = null;
  let poorLow: number | null = null;
  let highTouches = 0;
  let lowTouches = 0;
  for (const bins of brackets.values()) {
    for (let i = 0; i < POOR_TICKS; i++) {
      if (bins.has(maxBin - i)) {
        highTouches++;
        break;
      }
    }
    for (let i = 0; i < POOR_TICKS; i++) {
      if (bins.has(minBin + i)) {
        lowTouches++;
        break;
      }
    }
  }
  if (highTouches >= 2) poorHigh = maxBin * TICK;
  if (lowTouches >= 2) poorLow = minBin * TICK;

  return {
    poc: pocBin * TICK,
    vah: vahBin * TICK,
    val: valBin * TICK,
    singles,
    poorHigh,
    poorLow,
  };
}

function compute30mPocs(
  sessionBars: Candle[],
): Array<{ time: number; price: number }> {
  if (!sessionBars.length) return [];
  const sessionStart = sessionBars[0].time;
  const buckets = new Map<number, Candle[]>();
  for (const b of sessionBars) {
    const idx = Math.floor((b.time - sessionStart) / (BRACKET_MIN * 60));
    let list = buckets.get(idx);
    if (!list) {
      list = [];
      buckets.set(idx, list);
    }
    list.push(b);
  }
  const out: Array<{ time: number; price: number }> = [];
  for (const [idx, list] of buckets) {
    const counts = new Map<number, number>();
    for (const bar of list) {
      const lo = priceToBin(bar.low);
      const hi = priceToBin(bar.high);
      for (let b = lo; b <= hi; b++) counts.set(b, (counts.get(b) ?? 0) + 1);
    }
    if (!counts.size) continue;
    let best = 0;
    let bestBin = 0;
    for (const [bin, c] of counts) {
      if (c > best) {
        best = c;
        bestBin = bin;
      }
    }
    const bucketStart = sessionStart + idx * BRACKET_MIN * 60;
    out.push({ time: bucketStart, price: bestBin * TICK });
  }
  return out;
}

function findBreakRight(
  bars: Candle[],
  startT: number,
  price: number,
  fallback: number,
): { time: number; broken: boolean } {
  // First bar strictly after startT whose range covers price.
  for (const b of bars) {
    if (b.time <= startT) continue;
    if (b.low <= price && price <= b.high) {
      return { time: b.time, broken: true };
    }
  }
  return { time: fallback, broken: false };
}

export interface ProfileOpts {
  /** Include per-30m POCs (chart is on the 30m timeframe). */
  include30m: boolean;
}

export function computeProfileLevels(
  bars: Candle[],
  opts: ProfileOpts,
): ProfileLevel[] {
  if (!bars.length) return [];
  const lastBarTime = bars[bars.length - 1].time;
  const sessions = groupRthSessions(bars);
  const levels: ProfileLevel[] = [];

  for (const sess of sessions) {
    const prof = computeTpoProfile(sess.bars);
    if (!prof) continue;
    const startT = sess.end;
    const day = formatDayLabel(sess.start);

    const add = (
      kind: ProfileLevelKind,
      price: number,
      label: string,
      color: string,
      weight: number,
    ) => {
      const { time, broken } = findBreakRight(bars, startT, price, lastBarTime);
      levels.push({
        kind,
        price,
        startTime: startT,
        endTime: time,
        label,
        color,
        weight,
        broken,
      });
    };

    add("poc", prof.poc, `POC ${day}`, COLOR_POC, 2);
    add("vah", prof.vah, `VAH ${day}`, COLOR_VAH, 1.5);
    add("val", prof.val, `VAL ${day}`, COLOR_VAL, 1.5);
    for (const p of prof.singles) {
      add("single", p, `SP ${day}`, COLOR_SINGLE, 1);
    }
    if (prof.poorHigh != null)
      add("poorHigh", prof.poorHigh, `PH ${day}`, COLOR_POOR, 1.5);
    if (prof.poorLow != null)
      add("poorLow", prof.poorLow, `PL ${day}`, COLOR_POOR, 1.5);

    if (opts.include30m) {
      const pocs = compute30mPocs(sess.bars);
      for (const p of pocs) {
        const { time, broken } = findBreakRight(
          bars,
          p.time,
          p.price,
          lastBarTime,
        );
        levels.push({
          kind: "poc30m",
          price: p.price,
          startTime: p.time,
          endTime: time,
          label: `30m ${formatTimeLabel(p.time)}`,
          color: COLOR_POC30M,
          weight: 1,
          broken,
        });
      }
    }
  }

  return levels;
}
