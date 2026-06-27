// Opening Range indicator — pure logic.
// Computes per-day OR zones from raw 2-minute candles given a list of
// user configs. A zone "lives" from the window end until a future bar
// trades fully through both sides (high > zoneHigh && low < zoneLow).

export type Symbol = "ES" | "SPX";
export type SessionScope = "RTH" | "Globex" | "Both";

export interface OpeningRangeConfig {
  id: string;
  label: string;
  /** HH:MM in ET, 24h. */
  start: string;
  /** Window length in minutes. Default 2. */
  durationMin: number;
  /** "RTH" = 09:30–16:00 ET; "Globex" = outside RTH; "Both" = always. */
  scope: SessionScope;
  /** Hex color (e.g. "#22d3ee"). */
  color: string;
  enabled: boolean;
}

export interface OpeningRangeZone {
  configId: string;
  label: string;
  color: string;
  /** UNIX seconds. */
  windowStart: number;
  windowEnd: number;
  /** Right edge — either break bar time or last bar in dataset. */
  rightEdge: number;
  high: number;
  low: number;
  broken: boolean;
}

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

// Approximate ET offset (matches existing filterRTH heuristic: UTC-4).
const ET_OFFSET_HOURS = 4;

function etMinutesOfDay(timeSec: number): number {
  const d = new Date(timeSec * 1000);
  const hour = (d.getUTCHours() - ET_OFFSET_HOURS + 24) % 24;
  return hour * 60 + d.getUTCMinutes();
}

function etDateKey(timeSec: number): string {
  const shifted = new Date((timeSec - ET_OFFSET_HOURS * 3600) * 1000);
  return `${shifted.getUTCFullYear()}-${shifted.getUTCMonth() + 1}-${shifted.getUTCDate()}`;
}

function parseHHMM(s: string): number | null {
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

function isInRTH(min: number): boolean {
  return min >= 9 * 60 + 30 && min < 16 * 60;
}

export function DEFAULT_OPENING_RANGES(): OpeningRangeConfig[] {
  return [
    { id: "or-globex-pm", label: "Globex PM Open", start: "18:00", durationMin: 2, scope: "Globex", color: "#a78bfa", enabled: true },
    { id: "or-london", label: "London Pre", start: "03:00", durationMin: 2, scope: "Globex", color: "#f97316", enabled: true },
    { id: "or-premarket", label: "Pre-Market", start: "07:00", durationMin: 2, scope: "Globex", color: "#14b8a6", enabled: true },
    { id: "or-rth", label: "RTH Open", start: "09:30", durationMin: 2, scope: "RTH", color: "#22d3ee", enabled: true },
    { id: "or-lunch", label: "Lunch Reversal", start: "11:30", durationMin: 2, scope: "RTH", color: "#eab308", enabled: true },
    { id: "or-power", label: "Power Hour", start: "15:00", durationMin: 2, scope: "RTH", color: "#ec4899", enabled: true },
  ];
}

export function computeZones(
  bars: Candle[],
  configs: OpeningRangeConfig[],
  symbol: Symbol,
): OpeningRangeZone[] {
  if (!bars.length) return [];
  const zones: OpeningRangeZone[] = [];
  const lastBarTime = bars[bars.length - 1].time;

  for (const cfg of configs) {
    if (!cfg.enabled) continue;
    if (symbol === "SPX" && cfg.scope === "Globex") continue;
    const startMin = parseHHMM(cfg.start);
    if (startMin == null) continue;
    const endMin = startMin + Math.max(1, cfg.durationMin);

    // Group bars by ET date for windows that don't cross midnight.
    // If endMin <= 24*60 we can group simply by etDateKey.
    const byDay = new Map<string, Candle[]>();
    for (const b of bars) {
      const key = etDateKey(b.time);
      let list = byDay.get(key);
      if (!list) {
        list = [];
        byDay.set(key, list);
      }
      list.push(b);
    }

    for (const [, dayBars] of byDay) {
      const windowBars = dayBars.filter((b) => {
        const m = etMinutesOfDay(b.time);
        return m >= startMin && m < endMin;
      });
      if (!windowBars.length) continue;

      // Enforce scope on the window itself (skip RTH-scoped windows that
      // somehow fall outside RTH, or Globex-scoped that fall inside).
      const firstMin = etMinutesOfDay(windowBars[0].time);
      if (cfg.scope === "RTH" && !isInRTH(firstMin)) continue;
      if (cfg.scope === "Globex" && isInRTH(firstMin)) continue;

      const high = Math.max(...windowBars.map((b) => b.high));
      const low = Math.min(...windowBars.map((b) => b.low));
      const windowStart = windowBars[0].time;
      const windowEnd = windowBars[windowBars.length - 1].time;

      // Zone extends through the rest of the session (or to last bar in
      // dataset). We still record whether price broke through both sides
      // — consumers can dim/style broken zones — but we no longer truncate
      // the right edge at the break bar.
      let broken = false;
      for (const b of bars) {
        if (b.time <= windowEnd) continue;
        if (b.high > high && b.low < low) {
          broken = true;
          break;
        }
      }
      // Clip right edge to the end of the matching session on that ET day
      // (RTH zones end at the RTH close; Globex zones end with the last
      // non-RTH bar of that ET day). For the live/current day this naturally
      // ends at the most recent bar.
      const sessionBars = dayBars.filter((b) => {
        const m = etMinutesOfDay(b.time);
        if (cfg.scope === "RTH") return isInRTH(m);
        if (cfg.scope === "Globex") return !isInRTH(m);
        return true;
      });
      const sessionEnd = sessionBars.length
        ? sessionBars[sessionBars.length - 1].time
        : windowEnd;
      const rightEdge = Math.min(lastBarTime, sessionEnd);


      zones.push({
        configId: cfg.id,
        label: cfg.label,
        color: cfg.color,
        windowStart,
        windowEnd,
        rightEdge,
        high,
        low,
        broken,
      });
    }
  }

  return zones;
}
