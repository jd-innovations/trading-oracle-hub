import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getSchwabHistory } from "./schwab.functions";
import { supabase } from "@/integrations/supabase/client";
import type { Candle } from "./chart-utils";
import type { Timeframe } from "@/components/charts/ChartToolbar";

const TF_MAP: Record<Timeframe, "1m" | "2m" | "5m" | "15m" | "30m"> = {
  "2m": "2m",
  "5m": "5m",
  "15m": "15m",
  "30m": "30m",
  RTH: "2m",
};

export type EsFeedSource = "schwab" | "mock";

/**
 * Live ES futures feed via Schwab /ES front-month.
 * Polls history every 60s — no WebSocket (futures streamer requires
 * additional Schwab entitlement). Falls back silently to mock.
 */
export function useEsFeed(timeframe: Timeframe, symbol = "/ES") {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [isLive, setIsLive] = useState(false);
  const [source, setSource] = useState<EsFeedSource>("mock");
  const fetchHistory = useServerFn(getSchwabHistory);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const pull = async () => {
      const { data: s } = await supabase.auth.getSession();
      if (!s.session) {
        if (!cancelled) {
          setIsLive(false);
          setSource("mock");
        }
        return;
      }
      try {
        const r = await fetchHistory({
          data: { symbol, timeframe: TF_MAP[timeframe], lookbackDays: 5 },
        });
        if (cancelled) return;
        if (r.candles?.length) {
          setCandles(r.candles);
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
  }, [timeframe, symbol, fetchHistory]);

  return { candles, isLive, source };
}
