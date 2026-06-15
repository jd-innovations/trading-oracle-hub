import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { GexLevel } from "./gex.server";

export interface GexResult {
  levels: GexLevel[];
  asOf: number; // unix seconds
  spot: number | null;
  error?: string;
}

export const getSpxGex = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      expirations: z.number().int().min(1).max(3).default(1),
    }),
  )
  .handler(async ({ data }): Promise<GexResult> => {
    const token = process.env.TRADIER_ACCESS_TOKEN;
    const now = Math.floor(Date.now() / 1000);
    if (!token) return { levels: [], asOf: now, spot: null, error: "no_token" };
    const {
      fetchSpxExpirations,
      fetchSpxChain,
      fetchSpxSpot,
      computeGex,
    } = await import("./gex.server");

    const [exps, spot] = await Promise.all([
      fetchSpxExpirations(token),
      fetchSpxSpot(token),
    ]);
    if (!exps.length || spot == null) {
      return { levels: [], asOf: now, spot, error: "empty" };
    }
    const pick = exps.slice(0, data.expirations);
    const chains = await Promise.all(pick.map((e) => fetchSpxChain(token, e)));
    const merged = chains.flat();
    const levels = computeGex(merged, spot);
    if (!levels.length) return { levels: [], asOf: now, spot, error: "no_greeks" };
    return { levels, asOf: now, spot };
  });
