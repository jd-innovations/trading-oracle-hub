import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getSpxHistory, getSpxStreamSession } from "./spx-feed.functions";
import {
  getSchwabSpxHistory,
  getSchwabStreamSession,
  type SchwabStreamSessionDTO,
} from "./schwab.functions";
import { supabase } from "@/integrations/supabase/client";
import type { Candle } from "./chart-utils";
import type { Timeframe } from "@/components/charts/ChartToolbar";

const TF_MIN: Record<Timeframe, number> = {
  "2m": 2,
  "5m": 5,
  "15m": 15,
  "30m": 30,
  RTH: 2,
};

export type FeedSource = "schwab" | "tradier" | "mock";

interface TradierTradeMsg {
  type?: string;
  symbol?: string;
  price?: number;
  date?: number; // ms
}

interface SchwabStreamMsg {
  response?: Array<{
    service?: string;
    command?: string;
    content?: { code?: number; msg?: string };
  }>;
  data?: Array<{
    service?: string;
    timestamp?: number;
    content?: Array<Record<string | number, unknown>>;
  }>;
}

/**
 * Live SPX feed. Tries Schwab first (if signed in + connected), then
 * Tradier, then falls back silently to mock.
 */
export function useSpxFeed(timeframe: Timeframe) {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [isLive, setIsLive] = useState(false);
  const [source, setSource] = useState<FeedSource>("mock");

  const fetchSchwabHistory = useServerFn(getSchwabSpxHistory);
  const fetchTradierHistory = useServerFn(getSpxHistory);
  const fetchSchwabSession = useServerFn(getSchwabStreamSession);
  const fetchTradierSession = useServerFn(getSpxStreamSession);

  const wsRef = useRef<WebSocket | null>(null);
  const tfRef = useRef<Timeframe>(timeframe);
  tfRef.current = timeframe;

  // History
  useEffect(() => {
    let cancelled = false;
    const tf: Timeframe = timeframe === "RTH" ? "2m" : timeframe;
    (async () => {
      // Schwab is the primary feed (uses the stored connection — no sign-in required).
      try {
        const r = await fetchSchwabHistory({
          data: { timeframe: tf, lookbackDays: 5 },
        });
        if (!cancelled && r.candles?.length) {
          setCandles(r.candles);
          setSource("schwab");
          return;
        }
      } catch {
        /* fall through to Tradier as a last resort */
      }
      try {
        const r = await fetchTradierHistory({
          data: { timeframe: tf, lookbackDays: 5 },
        });
        if (!cancelled) {
          setCandles(r.candles ?? []);
          setSource(r.candles?.length ? "tradier" : "mock");
        }
      } catch {
        if (!cancelled) {
          setCandles([]);
          setSource("mock");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [timeframe, fetchSchwabHistory, fetchTradierHistory]);


  // Stream
  useEffect(() => {
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let backoff = 1000;

    const aggregateTick = (priceVal: number, tsMs: number) => {
      const ts = Math.floor(tsMs / 1000);
      const minutes = TF_MIN[tfRef.current];
      const bucketSec = minutes * 60;
      const bucketStart = Math.floor(ts / bucketSec) * bucketSec;
      setCandles((prev) => {
        if (!prev.length) return prev;
        const last = prev[prev.length - 1];
        if (last.time === bucketStart) {
          return [
            ...prev.slice(0, -1),
            {
              time: last.time,
              open: last.open,
              high: Math.max(last.high, priceVal),
              low: Math.min(last.low, priceVal),
              close: priceVal,
            },
          ];
        }
        if (bucketStart > last.time) {
          return [
            ...prev,
            {
              time: bucketStart,
              open: priceVal,
              high: priceVal,
              low: priceVal,
              close: priceVal,
            },
          ];
        }
        return prev;
      });
    };

    const connectSchwab = async (): Promise<boolean> => {
      const session = await fetchSchwabSession().catch(() => null);
      if (cancelled || !session) return false;
      let ws: WebSocket;
      try {
        ws = new WebSocket(session.wsUrl);
      } catch {
        return false;
      }
      wsRef.current = ws;
      const requestId = { n: 0 };
      const nextId = () => String(++requestId.n);

      ws.onopen = () => {
        backoff = 1000;
        // LOGIN
        ws.send(
          JSON.stringify({
            requests: [
              {
                service: "ADMIN",
                requestid: nextId(),
                command: "LOGIN",
                SchwabClientCustomerId: session.schwabClientCustomerId,
                SchwabClientCorrelId: session.schwabClientCorrelId,
                parameters: {
                  Authorization: session.accessToken,
                  SchwabClientChannel: session.schwabClientChannel,
                  SchwabClientFunctionId: session.schwabClientFunctionId,
                },
              },
            ],
          }),
        );
        // SUBS — LEVELONE_EQUITIES covers $SPX index; fields 1=bid 2=ask 3=last 35=quoteTime
        ws.send(
          JSON.stringify({
            requests: [
              {
                service: "LEVELONE_EQUITIES",
                requestid: nextId(),
                command: "SUBS",
                SchwabClientCustomerId: session.schwabClientCustomerId,
                SchwabClientCorrelId: session.schwabClientCorrelId,
                parameters: {
                  keys: session.symbols.join(","),
                  fields: "0,1,2,3,35",
                },
              },
            ],
          }),
        );
        setIsLive(true);
        setSource("schwab");
      };

      ws.onmessage = (ev) => {
        let msg: SchwabStreamMsg;
        try {
          msg = JSON.parse(typeof ev.data === "string" ? ev.data : "");
        } catch {
          return;
        }
        if (msg.response) {
          // LOGIN ack / SUBS ack — ignore unless code != 0
          for (const r of msg.response) {
            if (r.content?.code && r.content.code !== 0) {
              console.warn("[schwab stream]", r.service, r.command, r.content);
            }
          }
        }
        if (msg.data) {
          for (const d of msg.data) {
            if (d.service !== "LEVELONE_EQUITIES" || !d.content) continue;
            const ts = d.timestamp ?? Date.now();
            for (const c of d.content) {
              // Schwab returns numeric-keyed fields. 3 = lastPrice.
              const last = (c["3"] ?? c[3]) as number | undefined;
              if (typeof last === "number") aggregateTick(last, ts);
            }
          }
        }
      };

      ws.onerror = () => setIsLive(false);
      ws.onclose = () => {
        setIsLive(false);
        if (cancelled) return;
        reconnectTimer = setTimeout(connect, backoff);
        backoff = Math.min(backoff * 2, 30000);
      };
      return true;
    };

    const connectTradier = async (): Promise<boolean> => {
      const session = await fetchTradierSession().catch(() => null);
      if (cancelled || !session) return false;
      let ws: WebSocket;
      try {
        ws = new WebSocket(session.wsUrl);
      } catch {
        return false;
      }
      wsRef.current = ws;
      ws.onopen = () => {
        backoff = 1000;
        setIsLive(true);
        setSource("tradier");
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
        let msg: TradierTradeMsg;
        try {
          msg = JSON.parse(typeof ev.data === "string" ? ev.data : "");
        } catch {
          return;
        }
        if (msg.type !== "trade" || msg.price == null) return;
        aggregateTick(msg.price, msg.date ?? Date.now());
      };
      ws.onerror = () => setIsLive(false);
      ws.onclose = () => {
        setIsLive(false);
        if (cancelled) return;
        reconnectTimer = setTimeout(connect, backoff);
        backoff = Math.min(backoff * 2, 30000);
      };
      return true;
    };

    const connect = async () => {
      if (cancelled) return;
      // Always try Schwab first (uses stored connection — no Supabase session required).
      if (await connectSchwab()) return;
      await connectTradier();
    };


    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws && ws.readyState <= 1) ws.close();
    };
  }, [fetchSchwabSession, fetchTradierSession]);

  return { candles, isLive, source } satisfies {
    candles: Candle[];
    isLive: boolean;
    source: FeedSource;
  };
}

// Keep types used elsewhere
export type { SchwabStreamSessionDTO };
