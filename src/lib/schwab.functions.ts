import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Candle } from "./chart-utils";
import type { GexLevel } from "./gex.server";



// ---------- Status / disconnect / OAuth URL ----------

export interface SchwabStatus {
  connected: boolean;
  accessExpiresAt?: string;
  refreshExpiresAt?: string;
}

export const getSchwabStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SchwabStatus> => {
    const { getSchwabTokenInfo } = await import("./schwab.server");
    return getSchwabTokenInfo(context.userId);
  });

export const disconnectSchwab = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: true }> => {
    const { deleteSchwabTokens } = await import("./schwab.server");
    await deleteSchwabTokens(context.userId);
    return { ok: true };
  });

// ---------- Manual code exchange (fallback when auto-redirect doesn't land) ----------

export const exchangeSchwabCodeManual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({ codeOrUrl: z.string().trim().min(1).max(4000) }),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { exchangeAuthCode, persistTokens } = await import("./schwab.server");
    let code = data.codeOrUrl.trim();
    // If a full URL was pasted, pull ?code= out of it.
    if (/^https?:\/\//i.test(code)) {
      try {
        const u = new URL(code);
        if (u.hostname.includes("sws-gateway.schwab.com")) {
          throw new Error(
            "That is the Schwab brokerage login URL. Open developer.schwab.com, run the developer OAuth tool, then paste the oauth2-redirect URL or raw code.",
          );
        }
        const c = u.searchParams.get("code");
        if (!c) {
          throw new Error(
            "No code found. Paste the developer.schwab.com/oauth2-redirect.html URL that contains ?code=..., or paste the raw code.",
          );
        }
        code = c;
      } catch (e) {
        throw new Error(
          e instanceof Error ? e.message : "Could not parse URL",
        );
      }
    }
    // Schwab sometimes URL-encodes the code; decode if needed.
    try {
      const decoded = decodeURIComponent(code);
      if (decoded) code = decoded;
    } catch {
      /* ignore */
    }
    if (!code || code.includes("sws-gateway.schwab.com")) {
      throw new Error(
        "Paste the developer portal callback URL or raw code, not the Schwab brokerage login URL.",
      );
    }
    try {
      const tok = await exchangeAuthCode(code);
      await persistTokens(context.userId, tok);
      return { ok: true };
    } catch (e) {
      console.error("[schwab] manual exchange failed", e);
      throw new Error(
        e instanceof Error ? e.message : "Token exchange failed",
      );
    }
  });

// ---------- SPX history via Schwab ----------

export const getSchwabSpxHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      timeframe: z.enum(["1m", "2m", "5m", "15m", "30m"]),
      lookbackDays: z.number().int().min(1).max(10),
    }),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ candles: Candle[]; error?: string }> => {
      const {
        getSchwabAccessToken,
        fetchSchwabPriceHistory,
        SchwabReauthRequired,
      } = await import("./schwab.server");
      const { resample1mTo } = await import("./tradier.server");
      try {
        const token = await getSchwabAccessToken(context.userId);
        const bars = await fetchSchwabPriceHistory({
          token,
          symbol: "$SPX",
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
      } catch (e) {
        if (e instanceof SchwabReauthRequired) {
          return { candles: [], error: "reauth_required" };
        }
        console.error("[schwab] history failed", e);
        return { candles: [], error: "fetch_failed" };
      }
    },
  );

// ---------- SPX GEX via Schwab ----------

export const getSchwabSpxGex = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ expirations: z.number().int().min(1).max(3) }))
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      levels: GexLevel[];
      asOf: number;
      spot: number | null;
      error?: string;
    }> => {
      const now = Math.floor(Date.now() / 1000);
      const {
        getSchwabAccessToken,
        fetchSchwabChain,
        SchwabReauthRequired,
      } = await import("./schwab.server");
      const { computeGex } = await import("./gex.server");
      try {
        const token = await getSchwabAccessToken(context.userId);
        // Pick next N expirations: ask Schwab for a 30-day window and pick
        // the first `expirations` unique dates.
        const today = new Date();
        const fromDate = today.toISOString().slice(0, 10);
        const to = new Date(today.getTime() + 30 * 24 * 3600 * 1000)
          .toISOString()
          .slice(0, 10);
        const { spot, options } = await fetchSchwabChain({
          token,
          symbol: "$SPX",
          fromDate,
          toDate: to,
        });
        if (!options.length || spot == null) {
          return { levels: [], asOf: now, spot, error: "empty" };
        }
        // Filter to nearest N expirations
        const expDates = [
          ...new Set(options.map((o) => o.expiration_date ?? "")),
        ]
          .filter(Boolean)
          .sort();
        const keep = new Set(expDates.slice(0, data.expirations));
        const filtered = options.filter(
          (o) => o.expiration_date && keep.has(o.expiration_date),
        );
        const levels = computeGex(filtered, spot);
        if (!levels.length)
          return { levels: [], asOf: now, spot, error: "no_greeks" };
        return { levels, asOf: now, spot };
      } catch (e) {
        if (e instanceof SchwabReauthRequired) {
          return { levels: [], asOf: now, spot: null, error: "reauth_required" };
        }
        console.error("[schwab] gex failed", e);
        return { levels: [], asOf: now, spot: null, error: "fetch_failed" };
      }
    },
  );

// ---------- SPX Streamer session ----------

export interface SchwabStreamSessionDTO {
  wsUrl: string;
  accessToken: string;
  schwabClientCustomerId: string;
  schwabClientCorrelId: string;
  schwabClientChannel: string;
  schwabClientFunctionId: string;
  symbols: string[];
}

export const getSchwabStreamSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SchwabStreamSessionDTO | null> => {
    const { getSchwabAccessToken, getSchwabStreamerSession } = await import(
      "./schwab.server"
    );
    try {
      const token = await getSchwabAccessToken(context.userId);
      const sess = await getSchwabStreamerSession({
        token,
        symbols: ["$SPX"],
      });
      if (!sess) return null;
      return {
        wsUrl: sess.wsUrl,
        accessToken: sess.accessToken,
        schwabClientCustomerId: sess.schwabClientCustomerId,
        schwabClientCorrelId: sess.schwabClientCorrelId,
        schwabClientChannel: sess.schwabClientChannel,
        schwabClientFunctionId: sess.schwabClientFunctionId,
        symbols: sess.symbols,
      };
    } catch (e) {
      console.error("[schwab] stream session failed", e);
      return null;
    }
  });
