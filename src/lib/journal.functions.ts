import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type JournalKind = "trade" | "plan";
export type JournalSymbol = "ES" | "NQ";

export interface JournalEntry {
  id: string;
  kind: JournalKind;
  symbol: JournalSymbol;
  plan_date: string;
  side: "long" | "short" | null;
  bias: "Bullish" | "Bearish" | "Neutral" | null;
  entry_price: number | null;
  entry_label: string | null;
  exit_price: number | null;
  exit_label: string | null;
  entry_time: string | null;
  exit_time: string | null;
  phase: "closed_win" | "stopped" | null;
  realized_points: number | null;
  contracts: number | null;
  mfe_points: number | null;
  mae_points: number | null;
  mfe_time: string | null;
  pivot: number | null;
  score: number | null;
  session_high: number | null;
  session_low: number | null;
  session_close: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

const legInput = z.object({
  symbol: z.enum(["ES", "NQ"]),
  planDate: z.string(),
  bias: z.enum(["Bullish", "Bearish", "Neutral"]),
  side: z.enum(["long", "short"]),
  entryPrice: z.number(),
  entryLabel: z.string(),
  exitPrice: z.number(),
  exitLabel: z.string().nullable().optional(),
  entryTime: z.number(), // unix seconds
  exitTime: z.number(),
  phase: z.enum(["closed_win", "stopped"]),
  realizedPoints: z.number(),
  contracts: z.number().int(),
});

export const logAutoTraderLeg = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => legInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const entryIso = new Date(data.entryTime * 1000).toISOString();
    const exitIso = new Date(data.exitTime * 1000).toISOString();
    const notes = `${data.entryLabel} → ${data.exitLabel ?? "exit"}`;
    const { error } = await supabase
      .from("journal_entries")
      .upsert(
        {
          user_id: userId,
          kind: "trade",
          symbol: data.symbol,
          plan_date: data.planDate,
          side: data.side,
          bias: data.bias,
          entry_price: data.entryPrice,
          entry_label: data.entryLabel,
          exit_price: data.exitPrice,
          exit_label: data.exitLabel ?? null,
          entry_time: entryIso,
          exit_time: exitIso,
          phase: data.phase,
          realized_points: data.realizedPoints,
          contracts: data.contracts,
          notes,
        },
        { onConflict: "user_id,symbol,plan_date,entry_time" },
      );
    if (error) {
      console.error("[journal] logAutoTraderLeg failed", error);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  });

export const listJournal = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        symbol: z.enum(["All", "ES", "NQ"]).default("All"),
        from: z.string().optional(),
        to: z.string().optional(),
        limit: z.number().int().min(1).max(500).default(200),
      })
      .partial()
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }): Promise<{ entries: JournalEntry[] }> => {
    const { supabase, userId } = context;
    let q = supabase
      .from("journal_entries")
      .select("*")
      .eq("user_id", userId)
      .order("plan_date", { ascending: false })
      .order("entry_time", { ascending: false, nullsFirst: false })
      .limit(data?.limit ?? 200);
    if (data?.symbol && data.symbol !== "All") q = q.eq("symbol", data.symbol);
    if (data?.from) q = q.gte("plan_date", data.from);
    if (data?.to) q = q.lte("plan_date", data.to);
    const { data: rows, error } = await q;
    if (error) {
      console.error("[journal] list failed", error);
      return { entries: [] };
    }
    return { entries: (rows ?? []) as unknown as JournalEntry[] };
  });
