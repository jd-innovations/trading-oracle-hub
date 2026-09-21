// Server-side auto-trader tick. Called by pg_cron every minute; advances
// state for the Schwab owner across ES and NQ, posts newly generated events
// to the shared Discord webhook, and mirrors completed legs into the journal.
//
// Auth: pg_cron sends the Supabase anon key via the `apikey` header. On the
// published site /api/public/* bypasses framework auth so this route is
// reachable without a user session.

import { createFileRoute } from "@tanstack/react-router";
import { advance, initialState, isRthBar, type TradeState, type Bar, type CompletedLeg } from "@/lib/auto-trader/state";
import type { SymbolId } from "@/lib/symbols";
import type { DailyPlanRow } from "@/lib/plans.functions";

type TickResult = {
  symbol: SymbolId;
  status: string;
  events?: number;
  legs?: number;
  bars?: number;
};

function eventEmoji(kind: string): string {
  switch (kind) {
    case "entry": return "🟢";
    case "scale1":
    case "scale2": return "💰";
    case "stop_moved": return "🔧";
    case "stop_hit": return "🛑";
    case "target_hit": return "🎯";
    case "ext1_hit": return "🏁";
    case "leg_closed": return "🔁";
    case "closed": return "⏹";
    default: return "•";
  }
}

function fmtEt(t: number): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(t * 1000));
}

async function postDiscord(webhook: string, content: string): Promise<void> {
  const trimmed = content.length > 1900 ? content.slice(0, 1897) + "…" : content;
  const res = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: trimmed, allowed_mentions: { parse: ["everyone"] } }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[auto-trader/tick] discord ${res.status}: ${body}`);
  }
}

async function tickSymbol(symbol: SymbolId, webhook: string | undefined): Promise<TickResult> {
  const { getSchwabOwnerUserId, getSchwabAccessToken, fetchSchwabPriceHistory, SchwabReauthRequired } =
    await import("@/lib/schwab.server");
  const { getSymbol } = await import("@/lib/symbols");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const ownerId = await getSchwabOwnerUserId();
  if (!ownerId) return { symbol, status: "no_owner" };

  const sym = getSymbol(symbol);
  const todayET = new Date(Date.now() - 4 * 3600 * 1000).toISOString().slice(0, 10);

  // Load today's plan for this symbol.
  const { data: planRows, error: planErr } = await supabaseAdmin
    .from("daily_plans")
    .select("*")
    .eq("user_id", ownerId)
    .eq("symbol", symbol)
    .eq("plan_date", todayET)
    .limit(1);
  if (planErr) {
    console.error(`[auto-trader/tick] ${symbol} plan lookup failed`, planErr);
    return { symbol, status: "plan_lookup_failed" };
  }
  const plan = (planRows?.[0] as DailyPlanRow | undefined) ?? null;
  if (!plan) return { symbol, status: "no_plan" };

  // Load or initialize state.
  const { data: stateRows, error: stateErr } = await supabaseAdmin
    .from("auto_trader_state")
    .select("state, posted_event_count, logged_leg_count")
    .eq("user_id", ownerId)
    .eq("symbol", symbol)
    .eq("plan_date", todayET)
    .limit(1);
  if (stateErr) {
    console.error(`[auto-trader/tick] ${symbol} state lookup failed`, stateErr);
    return { symbol, status: "state_lookup_failed" };
  }

  let state: TradeState = (stateRows?.[0]?.state as unknown as TradeState | undefined) ?? initialState(plan, symbol);
  let postedCount: number = (stateRows?.[0]?.posted_event_count as number | undefined) ?? 0;
  let loggedLegCount: number = (stateRows?.[0]?.logged_leg_count as number | undefined) ?? 0;

  // Terminal (directional).
  if (state.mode === "directional" && (state.phase === "stopped" || state.phase === "closed_win")) {
    return { symbol, status: "terminal" };
  }

  // Fetch recent bars from Schwab.
  let bars;
  try {
    const token = await getSchwabAccessToken(ownerId);
    bars = await fetchSchwabPriceHistory({ token, symbol: sym.schwabRoot, lookbackDays: 1 });
  } catch (e) {
    if (e instanceof SchwabReauthRequired) return { symbol, status: "reauth_required" };
    console.error(`[auto-trader/tick] ${symbol} history failed`, e);
    return { symbol, status: "history_failed" };
  }
  if (!bars?.length) return { symbol, status: "no_bars" };

  // Advance across new bars only.
  let next = state;
  let advancedBars = 0;
  for (const b of bars) {
    if (b.time <= next.lastBarTime) continue;
    const bar: Bar = { time: b.time, open: b.open, high: b.high, low: b.low, close: b.close };
    if (!isRthBar(bar.time)) {
      next = { ...next, lastBarTime: bar.time };
      continue;
    }
    next = advance(next, plan, bar);
    advancedBars++;
  }

  // Post any new events.
  const newEvents = next.events.slice(postedCount);
  if (webhook && newEvents.length) {
    for (const ev of newEvents) {
      const line = `${eventEmoji(ev.kind)} **Auto-Trader | ${symbol}** · ${fmtEt(ev.time)} ET · ${ev.note ?? ev.kind}`;
      await postDiscord(webhook, line);
    }
  }
  const newPosted = next.events.length;

  // Log newly completed legs to journal (bypassing RLS via service role).
  const newLegs: CompletedLeg[] = next.completedLegs.slice(loggedLegCount);
  let loggedOk = 0;
  for (const leg of newLegs) {
    const { error: jErr } = await supabaseAdmin
      .from("journal_entries")
      .upsert(
        {
          user_id: ownerId,
          kind: "trade",
          symbol,
          plan_date: plan.plan_date,
          side: leg.side,
          bias: plan.bias,
          entry_price: leg.entry,
          entry_label: leg.entryLabel,
          exit_price: leg.exit,
          exit_label: leg.exitLabel ?? null,
          entry_time: new Date(leg.entryTime * 1000).toISOString(),
          exit_time: new Date(leg.exitTime * 1000).toISOString(),
          phase: leg.phase,
          realized_points: leg.realized,
          contracts: 3,
          mfe_points: leg.mfe ?? null,
          mae_points: leg.mae ?? null,
          mfe_time: leg.mfeTime ? new Date(leg.mfeTime * 1000).toISOString() : null,
          notes: `${leg.entryLabel} → ${leg.exitLabel ?? "exit"}`,
        },
        { onConflict: "user_id,symbol,plan_date,entry_time" },
      );
    if (jErr) {
      // Stop counting here so the next tick retries this leg instead of
      // silently skipping it forever.
      console.error(`[auto-trader/tick] ${symbol} journal upsert failed`, jErr);
      break;
    }
    loggedOk++;
  }
  const newLoggedLegs = loggedLegCount + loggedOk;


  // Persist updated state.
  const { error: upErr } = await supabaseAdmin
    .from("auto_trader_state")
    .upsert(
      {
        user_id: ownerId,
        symbol,
        plan_date: plan.plan_date,
        state: JSON.parse(JSON.stringify(next)),
        posted_event_count: newPosted,
        logged_leg_count: newLoggedLegs,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,symbol,plan_date" },
    );
  if (upErr) console.error(`[auto-trader/tick] ${symbol} state upsert failed`, upErr);

  return {
    symbol,
    status: "ok",
    events: newEvents.length,
    legs: newLegs.length,
    bars: advancedBars,
  };
}

export const Route = createFileRoute("/api/public/auto-trader/tick")({
  server: {
    handlers: {
      POST: async () => {
        const webhook = process.env.DISCORD_WEBHOOK_URL;
        if (!webhook) console.warn("[auto-trader/tick] DISCORD_WEBHOOK_URL not set — events will not post");
        const results: TickResult[] = [];
        for (const sym of ["ES", "NQ"] as const) {
          try {
            results.push(await tickSymbol(sym, webhook));
          } catch (e) {
            console.error(`[auto-trader/tick] ${sym} crashed`, e);
            results.push({ symbol: sym, status: "error" });
          }
        }
        return Response.json({ ok: true, results, at: new Date().toISOString() });
      },
      GET: async () => Response.json({ ok: true, hint: "POST to run a tick" }),
    },
  },
});
