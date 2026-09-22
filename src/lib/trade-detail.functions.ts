import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { TradeEvent, CompletedLeg } from "@/lib/auto-trader/state";

export interface TradeDetail {
  /** Events belonging to the requested leg, in order. */
  events: TradeEvent[];
  /** The completed-leg record stored alongside the state, if found. */
  leg: CompletedLeg | null;
  /** How many legs closed that day (neutral bias can produce more than one). */
  legCount: number;
  /** True when the day's state row exists but no events were saved. */
  missing: boolean;
}

/** Split a day's flat event list into per-leg slices (a leg ends on `closed`). */
function splitLegs(events: TradeEvent[]): TradeEvent[][] {
  const legs: TradeEvent[][] = [];
  let cur: TradeEvent[] = [];
  for (const e of events) {
    if (e.kind === "entry" && cur.length) {
      legs.push(cur);
      cur = [];
    }
    cur.push(e);
    if (e.kind === "leg_closed") {
      legs.push(cur);
      cur = [];
    }
  }
  if (cur.length) legs.push(cur);
  return legs;
}

export const getTradeDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        symbol: z.enum(["ES", "NQ"]),
        planDate: z.string(),
        /** Entry timestamp of the clicked trade (ISO string), used to pick the leg. */
        entryTime: z.string().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<TradeDetail> => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("auto_trader_state")
      .select("state")
      .eq("user_id", userId)
      .eq("symbol", data.symbol)
      .eq("plan_date", data.planDate)
      .maybeSingle();

    if (error) {
      console.error("[trade-detail] load failed", error);
      return { events: [], leg: null, legCount: 0, missing: true };
    }

    const state = (row?.state ?? null) as
      | { events?: TradeEvent[]; completedLegs?: CompletedLeg[] }
      | null;
    const allEvents = state?.events ?? [];
    const legs = state?.completedLegs ?? [];
    if (!allEvents.length) {
      return { events: [], leg: null, legCount: legs.length, missing: true };
    }

    const slices = splitLegs(allEvents);
    const entrySec = data.entryTime ? Math.floor(new Date(data.entryTime).getTime() / 1000) : null;

    let idx = 0;
    if (entrySec != null && slices.length > 1) {
      let bestDelta = Number.POSITIVE_INFINITY;
      slices.forEach((s, i) => {
        const first = s.find((e) => e.kind === "entry");
        if (!first) return;
        const delta = Math.abs(first.time - entrySec);
        if (delta < bestDelta) {
          bestDelta = delta;
          idx = i;
        }
      });
    }

    const slice = slices[idx] ?? [];
    const sliceEntry = slice.find((e) => e.kind === "entry");
    const leg =
      legs.find((l) => sliceEntry != null && Math.abs(l.entryTime - sliceEntry.time) < 60) ??
      (entrySec != null ? legs.find((l) => Math.abs(l.entryTime - entrySec) < 60) : undefined) ??
      null;

    return { events: slice, leg, legCount: slices.length, missing: false };
  });
