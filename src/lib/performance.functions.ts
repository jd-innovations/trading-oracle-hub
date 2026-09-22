import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface PerfTrade {
  plan_date: string;
  symbol: "ES" | "NQ";
  side: "long" | "short" | null;
  entry_price: number | null;
  exit_price: number | null;
  entry_label: string | null;
  exit_label: string | null;
  entry_time: string | null;
  exit_time: string | null;
  phase: "closed_win" | "stopped" | null;
  realized_points: number | null;
  contracts: number | null;
  mfe_points: number | null;
  mae_points: number | null;
  mfe_time: string | null;
}

/** All closed auto-trader legs for the signed-in user, oldest first. */
export const listPerfTrades = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ trades: PerfTrade[] }> => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("journal_entries")
      .select(
        "plan_date, symbol, side, entry_price, exit_price, entry_label, exit_label, exit_time, phase, realized_points, contracts, mfe_points, mae_points, mfe_time",
      )
      .eq("user_id", userId)
      .eq("kind", "trade")
      .not("phase", "is", null)
      .order("plan_date", { ascending: true })
      .order("exit_time", { ascending: true, nullsFirst: true })
      .limit(1000);
    if (error) {
      console.error("[performance] list failed", error);
      return { trades: [] };
    }
    return { trades: (data ?? []) as unknown as PerfTrade[] };
  });
