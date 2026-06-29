import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getSchwabHistory } from "./schwab.functions";

import { resampleCandles, type Candle } from "./chart-utils";
import type { Timeframe } from "@/components/charts/ChartToolbar";

const TF_MIN: Record<Timeframe, number> = {
  "2m": 2,
  "5m": 5,
  "15m": 15,
  "30m": 30,
  RTH: 2,
};

export type EsFeedSource = "schwab" | "mock";

/**
 * Live ES futures feed via Schwab /ES front-month.
 * Always fetches 1-minute bars and resamples client-side so that profile
 * calculations (POC / VAH / VAL / 30m POC) operate on the finest
 * granularity rather than on already-aggregated candles.
 */
export function useEsFeed(timeframe: Timeframe, symbol = "/ES") {
  const [base1m, setBase1m] = useState<Candle[]>([]);
  const [isLive, setIsLive] = useState(false);
  const [source, setSource] = useState<EsFeedSource>("mock");
  const fetchHistory = useServerFn(getSchwabHistory);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const pull = async () => {
      try {
        const r = await fetchHistory({
          data: { symbol, timeframe: "1m", lookbackDays: 5 },
        });
        if (cancelled) return;
        if (r.candles?.length) {
          setBase1m(r.candles);
          setIsLive(true);
          setSource("schwab");
        } else {
          setIsLive(false);
          setSource("mock");
        }
      } catch {
        if (!cancelled) {
          setIsLive(false);
          setSource("mock");
        }
      }
    };

    pull();
    timer = setInterval(pull, 60_000);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [symbol, fetchHistory]);

  const minutes = TF_MIN[timeframe];
  const candles = minutes <= 1 ? base1m : resampleCandles(base1m, minutes);

  return { candles, base1m, isLive, source };
}
