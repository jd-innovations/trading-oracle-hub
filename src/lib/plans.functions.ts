import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generatePlanFromBars, type GeneratedPlan } from "./plan-generator";

export interface DailyPlanRow {
  id: string;
  plan_date: string;
  symbol: string;
  bias: "Bullish" | "Bearish" | "Neutral";
  pivot: number;
  t1_up: number; t2_up: number; t3_up: number;
  t1_dn: number; t2_dn: number; t3_dn: number;
  prior_high: number | null;
  prior_low: number | null;
  prior_close: number | null;
  prior_poc: number | null;
  prior_vah: number | null;
  prior_val: number | null;
  naked_30m_pocs: number[];
  context: string | null;
  source: "auto" | "manual" | "auto+manual";
  published: boolean;
  published_at: string;
}

function toRow(p: GeneratedPlan, symbol: string) {
  return {
    plan_date: p.planDate,
    symbol,
    bias: p.bias,
    pivot: p.pivot,
    t1_up: p.t1Up, t2_up: p.t2Up, t3_up: p.t3Up,
    t1_dn: p.t1Dn, t2_dn: p.t2Dn, t3_dn: p.t3Dn,
    prior_high: p.priorHigh,
    prior_low: p.priorLow,
    prior_close: p.priorClose,
    prior_poc: p.priorPoc,
    prior_vah: p.priorVah,
    prior_val: p.priorVal,
    naked_30m_pocs: p.naked30mPocs,
    context: p.context,
    source: "auto" as const,
    published: true,
  };
}

export const generateDailyPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ symbol: z.string().default("/ES") }).partial())
  .handler(async ({ data, context }): Promise<{ plan?: DailyPlanRow; error?: string }> => {
    const symbol = data?.symbol ?? "/ES";
    const {
      getSchwabAccessToken,
      fetchSchwabPriceHistory,
      SchwabReauthRequired,
    } = await import("./schwab.server");
    let bars;
    try {
      const token = await getSchwabAccessToken(context.userId);
      bars = await fetchSchwabPriceHistory({ token, symbol, lookbackDays: 10 });
    } catch (e) {
      if (e instanceof SchwabReauthRequired) return { error: "reauth_required" };
      console.error("[plan] history fetch failed", e);
      return { error: "history_failed" };
    }
    if (!bars?.length) return { error: "no_bars" };

    const gen = generatePlanFromBars(bars);
    if (!gen) return { error: "insufficient_session_data" };

    const row = toRow(gen, symbol === "/ES" ? "ES" : symbol);
    const { data: upserted, error } = await context.supabase
      .from("daily_plans")
      .upsert({ ...row, user_id: context.userId }, { onConflict: "user_id,plan_date,symbol" })
      .select("*")
      .single();
    if (error) {
      console.error("[plan] upsert failed", error);
      return { error: "save_failed" };
    }
    return { plan: upserted as DailyPlanRow };
  });

export const getLatestPlan = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ symbol: z.string().default("ES") }).partial())
  .handler(async ({ data, context }): Promise<{ plan: DailyPlanRow | null }> => {
    const symbol = data?.symbol ?? "ES";
    const { data: rows, error } = await context.supabase
      .from("daily_plans")
      .select("*")
      .eq("symbol", symbol)
      .order("plan_date", { ascending: false })
      .limit(1);
    if (error) {
      console.error("[plan] fetch failed", error);
      return { plan: null };
    }
    return { plan: (rows?.[0] as DailyPlanRow | undefined) ?? null };
  });

export const listPlans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ limit: z.number().int().min(1).max(100).default(30) }).partial())
  .handler(async ({ data, context }): Promise<{ plans: DailyPlanRow[] }> => {
    const limit = data?.limit ?? 30;
    const { data: rows, error } = await context.supabase
      .from("daily_plans")
      .select("*")
      .order("plan_date", { ascending: false })
      .limit(limit);
    if (error) {
      console.error("[plan] list failed", error);
      return { plans: [] };
    }
    return { plans: (rows ?? []) as DailyPlanRow[] };
  });
