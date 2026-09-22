// Read/write the signed-in user's auto-trader rules (opening cool-off and
// early break-even threshold). The background tick reads the same row so
// unattended runs behave exactly like the live page.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DEFAULT_CONFIG, type AutoTraderConfig } from "@/lib/auto-trader/state";

const settingsSchema = z.object({
  coolOffEt: z.enum(["09:30", "09:35", "09:40", "09:45"]),
  earlyStopPct: z.number().int().min(0).max(100),
});

export const getAutoTraderSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AutoTraderConfig> => {
    const { data, error } = await context.supabase
      .from("auto_trader_settings")
      .select("cool_off_et, early_stop_pct")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) {
      console.error("[auto-trader-settings] load failed", error);
      return DEFAULT_CONFIG;
    }
    if (!data) return DEFAULT_CONFIG;
    return {
      coolOffEt: data.cool_off_et ?? DEFAULT_CONFIG.coolOffEt,
      earlyStopPct: data.early_stop_pct ?? DEFAULT_CONFIG.earlyStopPct,
    };
  });

export const saveAutoTraderSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => settingsSchema.parse(data))
  .handler(async ({ data, context }): Promise<AutoTraderConfig> => {
    const { error } = await context.supabase
      .from("auto_trader_settings")
      .upsert(
        {
          user_id: context.userId,
          cool_off_et: data.coolOffEt,
          early_stop_pct: data.earlyStopPct,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
    if (error) throw new Error(error.message);
    return data;
  });
