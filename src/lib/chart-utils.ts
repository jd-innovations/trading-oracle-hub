export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

/**
 * Aggregate candles into larger time buckets.
 * `minutes` is the target bar size (e.g. 5, 15). Source bars are 2-min.
 */
export function resampleCandles(bars: Candle[], minutes: number): Candle[] {
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

/**
 * Keep only RTH bars (09:30–16:00 ET). Approximation using UTC offset -4
 * (EDT) since the mock data has no real timezone metadata.
 */
export function filterRTH(bars: Candle[]): Candle[] {
  return bars.filter((b) => {
    const d = new Date(b.time * 1000);
    // Convert to approx ET (UTC-4)
    const etHour = (d.getUTCHours() - 4 + 24) % 24;
    const etMin = d.getUTCMinutes();
    const mins = etHour * 60 + etMin;
    return mins >= 9 * 60 + 30 && mins <= 16 * 60;
  });
}
