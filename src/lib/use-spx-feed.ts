import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getSpxHistory, getSpxStreamSession } from "./spx-feed.functions";
import type { Candle } from "./chart-utils";
import type { Timeframe } from "@/components/charts/ChartToolbar";

const TF_MIN: Record<Timeframe, number> = {
  "2m": 2,
  "5m": 5,
  "15m": 15,
  "30m": 30,
  RTH: 2,
};

interface TradeMsg {
  type?: string;
  symbol?: string;
  price?: number;
  size?: number;
  date?: number; // ms
  last?: number;
}

/**
 * Live SPX feed from Tradier. Returns the most recent N-minute candles
 * (resampled server-side) and updates the tail bar live via WebSocket.
 * If Tradier is unreachable, returns { candles: [], isLive: false } so the
 * caller can fall back to mock data silently.
 */
export function useSpxFeed(timeframe: Timeframe) {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [isLive, setIsLive] = useState(false);
  const fetchHistory = useServerFn(getSpxHistory);
  const fetchSession = useServerFn(getSpxStreamSession);
  const wsRef = useRef<WebSocket | null>(null);
  const tfRef = useRef<Timeframe>(timeframe);
  tfRef.current = timeframe;

  // Initial history + on-timeframe-change refetch.
  useEffect(() => {
    let cancelled = false;
    const tf: Timeframe = timeframe === "RTH" ? "2m" : timeframe;
    fetchHistory({ data: { timeframe: tf, lookbackDays: 5 } })
      .then((res) => {
        if (cancelled) return;
        setCandles(res.candles ?? []);
      })
      .catch(() => {
        if (!cancelled) setCandles([]);
      });
    return () => {
      cancelled = true;
    };
  }, [timeframe, fetchHistory]);

  // One streaming session, persists across timeframe changes.
  useEffect(() => {
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let backoff = 1000;

    const connect = async () => {
      if (cancelled) return;
      const session = await fetchSession().catch(() => null);
      if (cancelled || !session) {
        setIsLive(false);
        return;
      }
      let ws: WebSocket;
      try {
        ws = new WebSocket(session.wsUrl);
      } catch {
        setIsLive(false);
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        backoff = 1000;
        setIsLive(true);
        ws.send(
          JSON.stringify({
            symbols: [session.symbol],
            sessionid: session.sessionId,
            linebreak: true,
            filter: ["trade"],
          }),
        );
      };

      ws.onmessage = (ev) => {
        let msg: TradeMsg;
        try {
          msg = JSON.parse(typeof ev.data === "string" ? ev.data : "");
        } catch {
          return;
        }
        if (msg.type !== "trade" || msg.price == null) return;
        const ts = Math.floor((msg.date ?? Date.now()) / 1000);
        const minutes = TF_MIN[tfRef.current];
        const bucketSec = minutes * 60;
        const bucketStart = Math.floor(ts / bucketSec) * bucketSec;
        const price = msg.price;

        setCandles((prev) => {
          if (!prev.length) return prev;
          const last = prev[prev.length - 1];
          if (last.time === bucketStart) {
            const next: Candle = {
              time: last.time,
              open: last.open,
              high: Math.max(last.high, price),
              low: Math.min(last.low, price),
              close: price,
            };
            return [...prev.slice(0, -1), next];
          }
          if (bucketStart > last.time) {
            const next: Candle = {
              time: bucketStart,
              open: price,
              high: price,
              low: price,
              close: price,
            };
            return [...prev, next];
          }
          return prev;
        });
      };

      ws.onerror = () => {
        setIsLive(false);
      };

      ws.onclose = () => {
        setIsLive(false);
        if (cancelled) return;
        reconnectTimer = setTimeout(connect, backoff);
        backoff = Math.min(backoff * 2, 30000);
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws && ws.readyState <= 1) ws.close();
    };
  }, [fetchSession]);

  return { candles, isLive };
}
