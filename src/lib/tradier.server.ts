// Server-only Tradier brokerage API helpers. Read TRADIER_ACCESS_TOKEN
// inside the calling handler — not at module scope — so the Worker injects
// it at request time.
import type { Candle } from "./chart-utils";

const BASE = "https://api.tradier.com";

interface TimesalesBar {
  time: string; // "2024-06-13T13:30:00"
  timestamp: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

// Tradier's timesales `start`/`end` expects "YYYY-MM-DD HH:MM" in ET.
function toTradierTime(d: Date): string {
  // Approx ET = UTC - 4 (EDT). Matches the rest of the app's ET handling.
  const ms = d.getTime() - 4 * 3600 * 1000;
  const x = new Date(ms);
  return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(
    x.getUTCDate(),
  )} ${pad(x.getUTCHours())}:${pad(x.getUTCMinutes())}`;
}

export interface FetchHistoryOpts {
  token: string;
  symbol: string;
  lookbackDays: number;
}

/**
 * Fetch 1-minute RTH bars for the requested symbol from Tradier's
 * timesales endpoint. Returns [] on any failure so callers can fall back.
 */
export async function fetchTradier1mHistory(
  opts: FetchHistoryOpts,
): Promise<Candle[]> {
  const { token, symbol, lookbackDays } = opts;
  const end = new Date();
  const start = new Date(end.getTime() - lookbackDays * 24 * 3600 * 1000);
  const url = new URL("/v1/markets/timesales", BASE);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("interval", "1min");
  url.searchParams.set("start", toTradierTime(start));
  url.searchParams.set("end", toTradierTime(end));
  url.searchParams.set("session_filter", "open");

  try {
    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      console.error(
        `[tradier] timesales ${symbol} failed ${res.status}: ${await res.text().catch(() => "")}`,
      );
      return [];
    }
    const json = (await res.json()) as {
      series?: { data?: TimesalesBar | TimesalesBar[] } | null;
    };
    const raw = json.series?.data;
    if (!raw) return [];
    const arr = Array.isArray(raw) ? raw : [raw];
    return arr
      .filter((b) => b && Number.isFinite(b.timestamp))
      .map((b) => ({
        time: b.timestamp,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
      }));
  } catch (err) {
    console.error("[tradier] timesales error", err);
    return [];
  }
}

export interface TradierStreamSession {
  sessionId: string;
  wsUrl: string;
}

/** Create a market-events streaming session (~5 min idle TTL). */
export async function createTradierMarketSession(
  token: string,
): Promise<TradierStreamSession | null> {
  try {
    const res = await fetch(`${BASE}/v1/markets/events/session`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      console.error(
        `[tradier] session create failed ${res.status}: ${await res.text().catch(() => "")}`,
      );
      return null;
    }
    const json = (await res.json()) as {
      stream?: { sessionid?: string; url?: string };
    };
    const sid = json.stream?.sessionid;
    const url = json.stream?.url ?? "wss://ws.tradier.com/v1/markets/events";
    if (!sid) return null;
    return { sessionId: sid, wsUrl: url };
  } catch (err) {
    console.error("[tradier] session error", err);
    return null;
  }
}

/** Resample 1-min bars into N-minute buckets. */
export function resample1mTo(bars: Candle[], minutes: number): Candle[] {
  if (!bars.length || minutes <= 1) return bars;
  const bucketSec = minutes * 60;
  const out: Candle[] = [];
  let cur: Candle | null = null;
  let curBucket = -1;
  for (const b of bars) {
    const bucket = Math.floor(b.time / bucketSec);
    if (bucket !== curBucket) {
      if (cur) out.push(cur);
      cur = { ...b, time: bucket * bucketSec };
      curBucket = bucket;
    } else if (cur) {
      cur.high = Math.max(cur.high, b.high);
      cur.low = Math.min(cur.low, b.low);
      cur.close = b.close;
    }
  }
  if (cur) out.push(cur);
  return out;
}
