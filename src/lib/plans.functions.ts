import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
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
  .inputValidator(z.object({ symbol: z.string().default("/ES") }).partial())
  .handler(async ({ data }): Promise<{ plan?: DailyPlanRow; error?: string }> => {
    const { getSymbol } = await import("./symbols");
    const sym = getSymbol(data?.symbol ?? "/ES");
    const {
      getSchwabAccessToken,
      getSchwabOwnerUserId,
      fetchSchwabPriceHistory,
      SchwabReauthRequired,
    } = await import("./schwab.server");
    const ownerId = await getSchwabOwnerUserId();
    if (!ownerId) return { error: "reauth_required" };
    let bars;
    try {
      const token = await getSchwabAccessToken(ownerId);
      bars = await fetchSchwabPriceHistory({ token, symbol: sym.schwabRoot, lookbackDays: 40 });
    } catch (e) {
      if (e instanceof SchwabReauthRequired) return { error: "reauth_required" };
      console.error("[plan] history fetch failed", e);
      return { error: "history_failed" };
    }
    if (!bars?.length) return { error: "no_bars" };

    // Anchor = /ES print at 08:30:00 America/New_York on the plan date.
    // Falls back to the latest bar's close only if the 08:30 bar is missing
    // (e.g. plan is being regenerated mid-week before the open).
    const ET_OFFSET_HOURS = 4; // EDT; sufficient for intraday bar bucketing
    const todayKey = (() => {
      const now = new Date();
      const shifted = new Date(now.getTime() - ET_OFFSET_HOURS * 3600 * 1000);
      return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
    })();
    const find830 = () => {
      for (const b of bars) {
        const d = new Date(b.time * 1000);
        const etH = (d.getUTCHours() - ET_OFFSET_HOURS + 24) % 24;
        const etM = d.getUTCMinutes();
        const k = (() => {
          const s = new Date((b.time - ET_OFFSET_HOURS * 3600) * 1000);
          return `${s.getUTCFullYear()}-${String(s.getUTCMonth() + 1).padStart(2, "0")}-${String(s.getUTCDate()).padStart(2, "0")}`;
        })();
        if (k === todayKey && etH === 8 && etM === 30) return b;
      }
      return null;
    };
    const eightThirtyBar = find830();
    const anchor = eightThirtyBar ? eightThirtyBar.open : bars[bars.length - 1].close;
    const gen = generatePlanFromBars(bars, anchor, { tickSize: sym.tickSize, minGap: sym.minGap });
    if (!gen) return { error: "insufficient_session_data" };


    const row = toRow(gen, sym.id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: upserted, error } = await supabaseAdmin
      .from("daily_plans")
      .upsert({ ...row, user_id: ownerId }, { onConflict: "user_id,plan_date,symbol" })
      .select("*")
      .single();
    if (error) {
      console.error("[plan] upsert failed", error);
      return { error: "save_failed" };
    }

    // Mirror into journal_entries so the Journal reflects real plan activity.
    const { error: jErr } = await supabaseAdmin
      .from("journal_entries")
      .upsert(
        {
          user_id: ownerId,
          kind: "plan",
          symbol: sym.id,
          plan_date: gen.planDate,
          bias: gen.bias,
          pivot: gen.pivot,
          notes: gen.context ?? null,
        },
        { onConflict: "user_id,symbol,plan_date", ignoreDuplicates: false },
      );
    if (jErr) console.warn("[plan] journal mirror failed", jErr);

    return { plan: upserted as DailyPlanRow };
  });

export const getLatestPlan = createServerFn({ method: "GET" })
  .inputValidator(z.object({ symbol: z.string().default("ES") }).partial())
  .handler(async ({ data }): Promise<{ plan: DailyPlanRow | null }> => {
    const symbol = data?.symbol ?? "ES";
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
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
  .inputValidator(z.object({ limit: z.number().int().min(1).max(100).default(30) }).partial())
  .handler(async ({ data }): Promise<{ plans: DailyPlanRow[] }> => {
    const limit = data?.limit ?? 30;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
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

export const computePlanResultsFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    symbol: z.string().default("ES"),
    planDate: z.string().optional(),
  }).partial())
  .handler(async ({ data }): Promise<{
    results?: PlanResultComputed;
    plan?: DailyPlanRow;
    error?: string;
  }> => {
    const symbol = data?.symbol ?? "ES";
    const { getSymbol } = await import("./symbols");
    const sym = getSymbol(symbol);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin.from("daily_plans").select("*").eq("symbol", sym.id);
    if (data?.planDate) {
      q = q.eq("plan_date", data.planDate);
    } else {
      const todayET = new Date(Date.now() - 4 * 3600 * 1000).toISOString().slice(0, 10);
      q = q.lt("plan_date", todayET);
    }
    const { data: rows, error } = await q.order("plan_date", { ascending: false }).limit(1);
    if (error) { console.error("[results] plan lookup failed", error); return { error: "plan_lookup_failed" }; }
    const plan = (rows?.[0] as DailyPlanRow | undefined);
    if (!plan) return { error: "no_plan" };

    const { getSchwabAccessToken, getSchwabOwnerUserId, fetchSchwabPriceHistory, SchwabReauthRequired } =
      await import("./schwab.server");
    const ownerId = await getSchwabOwnerUserId();
    if (!ownerId) return { error: "reauth_required", plan };
    let bars;
    try {
      const token = await getSchwabAccessToken(ownerId);
      bars = await fetchSchwabPriceHistory({
        token,
        symbol: sym.schwabRoot,
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
