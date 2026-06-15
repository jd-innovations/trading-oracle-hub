import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Candle } from "./chart-utils";

// SPX symbol on Tradier: try the index symbol; if your account isn't
// entitled to index data the call will return empty and the client falls
// back to the mock generator silently.
const SPX_SYMBOL = "VIX" === "VIX" ? "SPX" : "SPX"; // placeholder kept for clarity
const SPX_STREAM_SYMBOL = "$SPX.X";

export const getSpxHistory = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      timeframe: z.enum(["1m", "2m", "5m", "15m", "30m"]),
      lookbackDays: z.number().int().min(1).max(60),
    }),
  )
  .handler(async ({ data }): Promise<{ candles: Candle[]; error?: string }> => {
    const token = process.env.TRADIER_ACCESS_TOKEN;
    if (!token) return { candles: [], error: "no_token" };
    const { fetchTradier1mHistory, resample1mTo } = await import(
      "./tradier.server"
    );
    const bars = await fetchTradier1mHistory({
      token,
      symbol: SPX_SYMBOL,
      lookbackDays: data.lookbackDays,
    });
    if (!bars.length) return { candles: [], error: "empty" };
    const minutes =
      data.timeframe === "1m"
        ? 1
        : data.timeframe === "2m"
          ? 2
          : data.timeframe === "5m"
            ? 5
            : data.timeframe === "15m"
              ? 15
              : 30;
    return { candles: resample1mTo(bars, minutes) };
  });

export const getSpxStreamSession = createServerFn({ method: "POST" }).handler(
  async (): Promise<{
    sessionId: string;
    wsUrl: string;
    symbol: string;
  } | null> => {
    const token = process.env.TRADIER_ACCESS_TOKEN;
    if (!token) return null;
    const { createTradierMarketSession } = await import("./tradier.server");
    const session = await createTradierMarketSession(token);
    if (!session) return null;
    return { ...session, symbol: SPX_STREAM_SYMBOL };
  },
);
