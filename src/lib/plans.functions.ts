import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generatePlanFromBars, type GeneratedPlan } from "./plan-generator";
import { computePlanResults, type PlanResultComputed } from "./plan-results";

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

    // Anchor = most recent bar close (live ES price near plan-gen time).
    const anchor = bars[bars.length - 1].close;
    const gen = generatePlanFromBars(bars, anchor);
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

/**
 * Compute results for a given plan_date (or the most recent prior session)
 * by replaying that day's RTH bars vs the saved plan.
 */
export const computePlanResultsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    symbol: z.string().default("ES"),
    planDate: z.string().optional(), // YYYY-MM-DD; defaults to most recent plan
  }).partial())
  .handler(async ({ data, context }): Promise<{
    results?: PlanResultComputed;
    plan?: DailyPlanRow;
    error?: string;
  }> => {
    const symbol = data?.symbol ?? "ES";
    let q = context.supabase.from("daily_plans").select("*").eq("symbol", symbol);
    if (data?.planDate) q = q.eq("plan_date", data.planDate);
    const { data: rows, error } = await q.order("plan_date", { ascending: false }).limit(1);
    if (error) { console.error("[results] plan lookup failed", error); return { error: "plan_lookup_failed" }; }
    const plan = (rows?.[0] as DailyPlanRow | undefined);
    if (!plan) return { error: "no_plan" };

    const { getSchwabAccessToken, fetchSchwabPriceHistory, SchwabReauthRequired } =
      await import("./schwab.server");
    let bars;
    try {
      const token = await getSchwabAccessToken(context.userId);
      bars = await fetchSchwabPriceHistory({
        token,
        symbol: symbol === "ES" ? "/ES" : symbol,
        lookbackDays: 10,
      });
    } catch (e) {
      if (e instanceof SchwabReauthRequired) return { error: "reauth_required", plan };
      console.error("[results] history fetch failed", e);
      return { error: "history_failed", plan };
    }
    if (!bars?.length) return { error: "no_bars", plan };

    const results = computePlanResults({
      date: plan.plan_date,
      bias: plan.bias,
      pivot: Number(plan.pivot),
      t1Up: Number(plan.t1_up), t2Up: Number(plan.t2_up), t3Up: Number(plan.t3_up),
      t1Dn: Number(plan.t1_dn), t2Dn: Number(plan.t2_dn), t3Dn: Number(plan.t3_dn),
    }, bars);
    if (!results) return { error: "no_session_bars", plan };
    return { results, plan };
  });
