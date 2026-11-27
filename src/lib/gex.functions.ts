import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { ExpirySet, GexComputation, GexLevel, GexQuality } from "./gex-engine";

export type GexSource = "schwab" | "tradier";

export interface GexResult {
  levels: GexLevel[];
  asOf: number; // unix seconds of the calculation
  spot: number | null;
  underlying: "SPX" | "QQQ";
  expirySet: ExpirySet;
  source: GexSource | null;
  regime: GexComputation["regime"];
  netGex: number;
  flips: number[];
  primaryFlip: number | null;
  expirations: string[];
  quality: GexQuality | null;
  method: string | null;
  error?: "no_source" | "reauth_required" | "empty" | "quality" | "fetch_failed";
}

const emptyResult = (underlying: "SPX" | "QQQ", expirySet: ExpirySet, now: number): GexResult => ({
  levels: [],
  asOf: Math.floor(now / 1000),
  spot: null,
  underlying,
  expirySet,
  source: null,
  regime: null,
  netGex: 0,
  flips: [],
  primaryFlip: null,
  expirations: [],
  quality: null,
  method: null,
});

/**
 * GEX levels for SPX or QQQ from the broker connection (Schwab first, Tradier fallback).
 * Personal-use research data: never falls back to mock levels.
 */
export const getGex = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      underlying: z.enum(["SPX", "QQQ"]).default("SPX"),
      expirySet: z.enum(["0dte", "sigma4", "monthly"]).default("0dte"),
    }),
  )
  .handler(async ({ data }): Promise<GexResult> => {
    const now = Date.now();
    const base = emptyResult(data.underlying, data.expirySet, now);
    const { computeGexLevels } = await import("./gex-engine");
    const { fetchSchwabNormalizedChain, fetchTradierChain } = await import("./gex.server");

    const finish = (
      chain: { spot: number | null; options: import("./gex-engine").RawOption[] },
      source: GexSource,
    ): GexResult | null => {
      if (chain.spot == null || !chain.options.length) return null;
      const r = computeGexLevels(chain.options, data.expirySet, { spot: chain.spot, now });
      if (!r) return { ...base, spot: chain.spot, source, error: "empty" };
      return {
        ...base,
        ...r,
        spot: chain.spot,
        source,
        error: r.quality.status === "unusable" ? "quality" : undefined,
      };
    };

    let reauth = false;
    // 1) Schwab (stored owner connection)
    try {
      const { getSchwabAccessToken, getSchwabOwnerUserId, schwabGet, SchwabReauthRequired } =
        await import("./schwab.server");
      try {
        const ownerId = await getSchwabOwnerUserId();
        const token = await getSchwabAccessToken(ownerId);
        const chain = await fetchSchwabNormalizedChain({
          token,
          underlying: data.underlying,
          set: data.expirySet,
          now,
          get: schwabGet,
        });
        const r = finish(chain, "schwab");
        if (r && !r.error) return r;
        if (r?.error === "quality") return r; // data arrived but failed quality rules: report, don't mask
      } catch (e) {
        if (e instanceof SchwabReauthRequired) reauth = true;
        else console.error("[gex] schwab failed", e);
      }
    } catch (e) {
      console.error("[gex] schwab module failed", e);
    }

    // 2) Tradier fallback
    const tradierToken = process.env.TRADIER_ACCESS_TOKEN;
    if (tradierToken) {
      try {
        const chain = await fetchTradierChain(tradierToken, data.underlying, data.expirySet, now);
        const r = finish(chain, "tradier");
        if (r) return r;
      } catch (e) {
        console.error("[gex] tradier failed", e);
      }
    }

    return {
      ...base,
      error: reauth ? "reauth_required" : tradierToken ? "fetch_failed" : "no_source",
    };
  });
