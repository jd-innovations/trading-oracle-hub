// Static dummy data for the trading planner shell.
// All prices/times are illustrative.

export type Bias = "Bullish" | "Bearish" | "Neutral";

export interface DailyPlan {
  date: string; // MM/DD/YYYY
  symbol: string;
  t1Up: number;
  t2Up: number;
  t3Up: number;
  pivot: number;
  now: number;
  t1Dn: number;
  t2Dn: number;
  t3Dn: number;
  bias: Bias;
  biasReason: string;
  context: string;
  events?: string;
}

export const dailyPlan: DailyPlan = {
  date: "06/13/2026",
  symbol: "ES2026",
  t3Up: 6118.5,
  t2Up: 6104.25,
  t1Up: 6092.75,
  pivot: 6082.5,
  now: 6086.25,
  t1Dn: 6072.0,
  t2Dn: 6058.75,
  t3Dn: 6044.5,
  bias: "Bullish",
  biasReason:
    "Overnight inventory short into prior day VAH with a clean responsive bid at globex midpoint.",
  context:
    "Yesterday closed near the highs after acceptance above 6075 value. Overnight extended into 6090s with thin TPO above. Expecting rotation into T1 6092.75 early; failure back below pivot opens a test of overnight low 6072.",
  events: "10:00 ET — Consumer Sentiment (Prelim)",
};

export interface PlanResult {
  date: string;
  bias: Bias;
  biasHit: boolean;
  pivot: number;
  pivotHeld: boolean;
  ups: Array<{ price: number; hit: boolean; time?: string }>;
  dns: Array<{ price: number; hit: boolean; time?: string }>;
  high: number;
  low: number;
  close: number;
  score: number;
}

export const planResult: PlanResult = {
  date: "06/12/2026",
  bias: "Bullish",
  biasHit: true,
  pivot: 6071.25,
  pivotHeld: true,
  ups: [
    { price: 6082.5, hit: true, time: "10:14" },
    { price: 6094.25, hit: true, time: "13:42" },
    { price: 6108.0, hit: false },
  ],
  dns: [
    { price: 6060.0, hit: false },
    { price: 6048.75, hit: false },
    { price: 6034.5, hit: false },
  ],
  high: 6097.5,
  low: 6068.25,
  close: 6094.0,
  score: 82,
};

// Generate ~200 bars of 2-min candles around the levels (used by SPX).
function genCandles(seed: number, start: number, count = 200) {
  let s = seed;
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  const bars: Array<{ time: number; open: number; high: number; low: number; close: number }> = [];
  let price = start;
  // Fixed illustrative start time so SSR and client render the same data.
  let t = Date.UTC(2026, 5, 13, 13, 30) / 1000;
  for (let i = 0; i < count; i++) {
    const drift = (rand() - 0.48) * 1.8;
    const open = price;
    const close = open + drift;
    const high = Math.max(open, close) + rand() * 1.2;
    const low = Math.min(open, close) - rand() * 1.2;
    bars.push({
      time: t,
      open: +open.toFixed(2),
      high: +high.toFixed(2),
      low: +low.toFixed(2),
      close: +close.toFixed(2),
    });
    price = close;
    t += 120;
  }
  return bars;
}

// Multi-session generator for ES — produces N weekday RTH sessions
// (09:30–16:00 ET) of 2-min bars so profile-level computations have
// enough historical data. Anchored to a fixed date for SSR stability.
function genRthSessions(seed: number, start: number, sessions = 35) {
  let s = seed;
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  const bars: Array<{ time: number; open: number; high: number; low: number; close: number }> = [];
  let price = start;
  // Anchor: Fri 06/12/2026 — work backwards `sessions` weekdays.
  const anchor = new Date(Date.UTC(2026, 5, 12));
  const days: Array<{ y: number; m: number; d: number }> = [];
  const cursor = new Date(anchor);
  while (days.length < sessions) {
    const dow = cursor.getUTCDay();
    if (dow !== 0 && dow !== 6) {
      days.unshift({
        y: cursor.getUTCFullYear(),
        m: cursor.getUTCMonth(),
        d: cursor.getUTCDate(),
      });
    }
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  for (const day of days) {
    // 09:30 ET == 13:30 UTC (assuming UTC-4 / EDT, matches filterRTH).
    let t = Date.UTC(day.y, day.m, day.d, 13, 30) / 1000;
    const sessionEnd = t + 6.5 * 3600; // 16:00 ET
    while (t < sessionEnd) {
      const drift = (rand() - 0.48) * 1.8;
      const open = price;
      const close = open + drift;
      const high = Math.max(open, close) + rand() * 1.2;
      const low = Math.min(open, close) - rand() * 1.2;
      bars.push({
        time: t,
        open: +open.toFixed(2),
        high: +high.toFixed(2),
        low: +low.toFixed(2),
        close: +close.toFixed(2),
      });
      price = close;
      t += 120;
    }
    // Overnight drift between sessions
    price += (rand() - 0.5) * 8;
  }
  return bars;
}

export const esCandles = genRthSessions(42, 6020, 35);
export const spxCandles = genCandles(7, 6085).map((c) => ({
  ...c,
  open: +(c.open + 4).toFixed(2),
  high: +(c.high + 4).toFixed(2),
  low: +(c.low + 4).toFixed(2),
  close: +(c.close + 4).toFixed(2),
}));




export interface NakedLevel {
  label: string;
  price: number;
  age: string;
  type: "VAH" | "VAL" | "POC" | "Single" | "HVN" | "LVN";
}
export const nakedLevels: NakedLevel[] = [
  { label: "Prior Day VAH", price: 6088.25, age: "1d", type: "VAH" },
  { label: "06/05 POC", price: 6042.0, age: "6d", type: "POC" },
  { label: "Weekly VAL", price: 5988.5, age: "4d", type: "VAL" },
  { label: "Single Prints", price: 6064.0, age: "2d", type: "Single" },
  { label: "06/02 HVN", price: 6020.75, age: "9d", type: "HVN" },
];

export interface Flag {
  kind: "Poor High" | "Poor Low" | "Spike" | "Tail" | "Single Prints";
  price: number;
  detail: string;
}
export const structuralFlags: Flag[] = [
  { kind: "Poor High", price: 6097.5, detail: "Multiple TPOs at high — unfinished business" },
  { kind: "Tail", price: 6068.25, detail: "3-TPO buying tail in B period" },
  { kind: "Single Prints", price: 6082.0, detail: "K period single prints" },
];

export interface BalanceZone {
  label: string;
  timeframe: "Daily" | "Weekly";
  high: number;
  halfback: number;
  low: number;
  otf: "Up" | "Down" | "None";
  breakout: "Above" | "Below" | "Inside";
}
export const balanceZones: BalanceZone[] = [
  {
    label: "Current Daily",
    timeframe: "Daily",
    high: 6097.5,
    halfback: 6082.75,
    low: 6068.0,
    otf: "None",
    breakout: "Inside",
  },
  {
    label: "Current Week",
    timeframe: "Weekly",
    high: 6112.0,
    halfback: 6065.0,
    low: 6018.0,
    otf: "Up",
    breakout: "Inside",
  },
  {
    label: "Prior Week",
    timeframe: "Weekly",
    high: 6022.5,
    halfback: 5980.0,
    low: 5937.5,
    otf: "None",
    breakout: "Above",
  },
];

export interface IronFlyRec {
  symbol: string;
  expiry: string;
  spot: number;
  shortCall: number;
  shortPut: number;
  longCall: number;
  longPut: number;
  credit: number;
  width: number;
  maxRisk: number;
  beLow: number;
  beHigh: number;
  generatedAt: string;
}
export const ironFly: IronFlyRec = {
  symbol: "SPX",
  expiry: "06/13/2026",
  spot: 6088.4,
  shortCall: 6090,
  shortPut: 6090,
  longCall: 6115,
  longPut: 6065,
  credit: 14.25,
  width: 25,
  maxRisk: 10.75,
  beLow: 6075.75,
  beHigh: 6104.25,
  generatedAt: "09:45 ET",
};

export interface GexLevel {
  label: string;
  price: number;
  weight: number;
}
export const gexLevels: GexLevel[] = [
  { label: "Call Wall", price: 6115, weight: 1 },
  { label: "Gamma Flip", price: 6072, weight: 0.7 },
  { label: "Put Wall", price: 6040, weight: 0.9 },
  { label: "HVL", price: 6090, weight: 0.5 },
];

export interface FeedItem {
  time: string;
  body: string;
  tag: "Open" | "Update" | "Adjust" | "Alert";
}
export const ironFlyFeed: FeedItem[] = [
  { time: "09:45", body: "Opened SPX 6090/6090 IF. Credit 14.25. Hedges at ±25.", tag: "Open" },
  { time: "10:15", body: "Spot 6086. Theta accruing, deltas flat (+3). Hold.", tag: "Update" },
  { time: "10:45", body: "Test of 6090 short call. IV crush continuing.", tag: "Update" },
  { time: "11:15", body: "Roll call hedge from 6115 → 6110 for +1.75 debit. Risk reduced.", tag: "Adjust" },
  { time: "11:45", body: "Trading range 6082-6092. Position untouched.", tag: "Update" },
  { time: "12:15", body: "Lunch chop. P&L +5.20. Mid-day pin probability rising.", tag: "Update" },
];

export interface JournalEntry {
  id: string;
  date: string;
  instrument: "ES" | "SPX";
  setup: string;
  bias?: Bias;
  result: "Win" | "Loss" | "Scratch";
  pnl: number;
  score?: number;
  notes: string;
}
export const journal: JournalEntry[] = [
  { id: "1", date: "06/12/2026", instrument: "ES", setup: "Daily Plan — Bullish", bias: "Bullish", result: "Win", pnl: 1180, score: 82, notes: "T1 + T2 hit, T3 missed by 4 ticks." },
  { id: "2", date: "06/12/2026", instrument: "SPX", setup: "Iron Fly 6080", result: "Win", pnl: 525, notes: "Pin held into close." },
  { id: "3", date: "06/11/2026", instrument: "ES", setup: "Daily Plan — Neutral", bias: "Neutral", result: "Win", pnl: 420, score: 68, notes: "Balance day, both T1s hit." },
  { id: "4", date: "06/11/2026", instrument: "SPX", setup: "Iron Fly 6075", result: "Loss", pnl: -310, notes: "Adjusted call side, finished outside short strikes." },
  { id: "5", date: "06/10/2026", instrument: "ES", setup: "Daily Plan — Bullish", bias: "Bullish", result: "Loss", pnl: -640, score: 41, notes: "Pivot failed early, reversed lower." },
  { id: "6", date: "06/10/2026", instrument: "SPX", setup: "Iron Fly 6060", result: "Win", pnl: 610, notes: "Clean pin." },
  { id: "7", date: "06/09/2026", instrument: "ES", setup: "Daily Plan — Bearish", bias: "Bearish", result: "Win", pnl: 950, score: 77, notes: "T1 + T2 down hit by lunch." },
  { id: "8", date: "06/09/2026", instrument: "SPX", setup: "Iron Fly 6055", result: "Scratch", pnl: 25, notes: "Closed early on vol spike." },
  { id: "9", date: "06/06/2026", instrument: "ES", setup: "Daily Plan — Bullish", bias: "Bullish", result: "Win", pnl: 1320, score: 88, notes: "T3 tagged at 14:05." },
  { id: "10", date: "06/06/2026", instrument: "SPX", setup: "Iron Fly 6050", result: "Win", pnl: 480, notes: "Steady decay." },
];

export interface PerfWindow {
  label: "L5" | "L10" | "L20" | "All";
  biasAcc: number;
  pivotHold: number;
  t1Up: number;
  t2Up: number;
  t3Up: number;
  t1Dn: number;
  t2Dn: number;
  t3Dn: number;
  extension: number;
  avgScore: number;
}
export const perfWindows: PerfWindow[] = [
  { label: "L5", biasAcc: 80, pivotHold: 80, t1Up: 90, t2Up: 70, t3Up: 40, t1Dn: 80, t2Dn: 60, t3Dn: 20, extension: 30, avgScore: 74 },
  { label: "L10", biasAcc: 70, pivotHold: 75, t1Up: 85, t2Up: 65, t3Up: 35, t1Dn: 78, t2Dn: 55, t3Dn: 25, extension: 28, avgScore: 71 },
  { label: "L20", biasAcc: 68, pivotHold: 72, t1Up: 82, t2Up: 60, t3Up: 32, t1Dn: 75, t2Dn: 52, t3Dn: 22, extension: 26, avgScore: 69 },
  { label: "All", biasAcc: 66, pivotHold: 70, t1Up: 80, t2Up: 58, t3Up: 30, t1Dn: 72, t2Dn: 50, t3Dn: 20, extension: 24, avgScore: 67 },
];

export const equityCurve = (() => {
  let s = 13;
  const pts: Array<{ time: number; value: number }> = [];
  let v = 0;
  const start = Math.floor(Date.now() / 1000) - 60 * 86400;
  for (let i = 0; i < 60; i++) {
    s = (s * 9301 + 49297) % 233280;
    const r = s / 233280;
    v += (r - 0.42) * 850;
    pts.push({ time: start + i * 86400, value: +v.toFixed(2) });
  }
  return pts;
})();
