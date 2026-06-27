import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Copy, Check, RefreshCw } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell, Panel } from "@/components/layout/AppShell";
import { EsChartPanel } from "@/components/charts/EsChartPanel";
import { TpoProfile } from "@/components/charts/TpoProfile";
import { dailyPlan as mockPlan, planResult } from "@/lib/mock/data";
import { fmtPrice, planToText, resultToText } from "@/lib/format";
import { generateDailyPlan, getLatestPlan, type DailyPlanRow } from "@/lib/plans.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Daily Plan — JD Trading Planner" },
      { name: "description", content: "Today's ES futures daily plan with targets, pivot, bias, and context." },
    ],
  }),
  component: PlanPage,
});

interface PlanView {
  symbol: string;
  date: string;
  bias: "Bullish" | "Bearish" | "Neutral";
  biasReason: string;
  pivot: number;
  t1Up: number; t2Up: number; t3Up: number;
  t1Dn: number; t2Dn: number; t3Dn: number;
  now: number;
  context: string;
  events?: string;
  source: "live" | "mock";
  naked30m?: number[];
  priorHigh?: number;
  priorLow?: number;
  priorClose?: number;
  priorPoc?: number;
  priorVah?: number;
  priorVal?: number;
}

function rowToView(r: DailyPlanRow, now: number): PlanView {
  return {
    symbol: r.symbol,
    date: r.plan_date,
    bias: r.bias,
    biasReason: r.context?.split(" — ")[0] ?? "",
    pivot: Number(r.pivot),
    t1Up: Number(r.t1_up), t2Up: Number(r.t2_up), t3Up: Number(r.t3_up),
    t1Dn: Number(r.t1_dn), t2Dn: Number(r.t2_dn), t3Dn: Number(r.t3_dn),
    now,
    context: r.context ?? "",
    source: "live",
    naked30m: (r.naked_30m_pocs ?? []).map(Number),
    priorHigh: r.prior_high != null ? Number(r.prior_high) : undefined,
    priorLow: r.prior_low != null ? Number(r.prior_low) : undefined,
    priorClose: r.prior_close != null ? Number(r.prior_close) : undefined,
    priorPoc: r.prior_poc != null ? Number(r.prior_poc) : undefined,
    priorVah: r.prior_vah != null ? Number(r.prior_vah) : undefined,
    priorVal: r.prior_val != null ? Number(r.prior_val) : undefined,
  };
}

const mockView: PlanView = {
  symbol: mockPlan.symbol,
  date: mockPlan.date,
  bias: mockPlan.bias,
  biasReason: mockPlan.biasReason,
  pivot: mockPlan.pivot,
  t1Up: mockPlan.t1Up, t2Up: mockPlan.t2Up, t3Up: mockPlan.t3Up,
  t1Dn: mockPlan.t1Dn, t2Dn: mockPlan.t2Dn, t3Dn: mockPlan.t3Dn,
  now: mockPlan.now,
  context: mockPlan.context,
  events: mockPlan.events,
  source: "mock",
};

function PlanPage() {
  const [plan, setPlan] = useState<PlanView>(mockView);
  const [authed, setAuthed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const fetchLatest = useServerFn(getLatestPlan);
  const fetchGenerate = useServerFn(generateDailyPlan);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!data.session) return;
      setAuthed(true);
      try {
        const r = await fetchLatest({ data: { symbol: "ES" } });
        if (!cancelled && r.plan) setPlan(rowToView(r.plan, Number(r.plan.pivot)));
      } catch {
        /* keep mock */
      }
    })();
    return () => { cancelled = true; };
  }, [fetchLatest]);

  async function generate() {
    setBusy(true); setMsg(null);
    try {
      const r = await fetchGenerate({ data: { symbol: "/ES" } });
      if (r.error) {
        setMsg(
          r.error === "reauth_required" ? "Schwab session expired — reconnect in Brokers."
          : r.error === "no_bars" ? "Schwab returned no /ES bars (check entitlement)."
          : r.error === "insufficient_session_data" ? "Not enough RTH data yet — try after 09:30 ET."
          : "Plan generation failed."
        );
      } else if (r.plan) {
        setPlan(rowToView(r.plan, Number(r.plan.pivot)));
        setMsg(`Plan generated for ${r.plan.plan_date}.`);
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Plan generation failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell title="Daily Plan" subtitle="Module 1 · ES Futures">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span
          className={`mono rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
            plan.source === "live"
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
              : "border-border bg-surface-2 text-muted-foreground"
          }`}
        >
          {plan.source === "live" ? "LIVE · SCHWAB /ES" : "MOCK DATA"}
        </span>
        {authed && (
          <button
            onClick={generate}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2.5 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${busy ? "animate-spin" : ""}`} />
            {busy ? "Generating..." : "Generate Today's Plan"}
          </button>
        )}
        {!authed && (
          <span className="text-[11px] text-muted-foreground">
            Sign in & connect Schwab to generate live plans.
          </span>
        )}
        {msg && <span className="text-[11px] text-muted-foreground">{msg}</span>}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <DailyPlanCard plan={plan} />
          <TargetsExplained plan={plan} />
          <EsChartPanel />
        </div>
        <div className="space-y-3">
          <LevelRail plan={plan} />
          {plan.naked30m && plan.naked30m.length > 0 && (
            <Panel title="Naked 30m POCs (prior session)">
              <ul className="space-y-1">
                {plan.naked30m.map((p) => (
                  <li
                    key={p}
                    className="mono flex items-center justify-between rounded border border-border/60 bg-surface-1 px-2 py-1 text-xs"
                  >
                    <span className="text-info">30m POC</span>
                    <span className="font-semibold">{fmtPrice(p)}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          <Panel title="Session TPO (Live)"><TpoProfile compact /></Panel>
        </div>
      </div>
      <div className="mt-3">
        <PlanResultsCard />
      </div>
    </AppShell>
  );
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function DailyPlanCard({ plan: p }: { plan: PlanView }) {
  const text = planToText({
    symbol: p.symbol,
    date: p.date,
    bias: p.bias,
    biasReason: p.biasReason,
    pivot: p.pivot,
    t1Up: p.t1Up, t2Up: p.t2Up, t3Up: p.t3Up,
    t1Dn: p.t1Dn, t2Dn: p.t2Dn, t3Dn: p.t3Dn,
    now: p.now,
    context: p.context,
    events: p.events,
  });
  const biasColor =
    p.bias === "Bullish" ? "text-bull" : p.bias === "Bearish" ? "text-bear" : "text-info";
  return (
    <Panel title="Daily Plan (Discord Format)" right={<CopyBtn text={text} />}>
      <pre className="mono whitespace-pre-wrap break-words text-[12.5px] leading-relaxed text-foreground">
{`Daily Plan: ${p.symbol}
$ES FUTURES ${p.date}

`}<span className="text-bull">{`T3↑ ${fmtPrice(p.t3Up)} >> T2↑ ${fmtPrice(p.t2Up)} >> T1↑ ${fmtPrice(p.t1Up)}`}</span>{`
`}<span className="text-pivot">{`Daily Pivot: ${fmtPrice(p.pivot)}`}</span>{` / Now trading at `}<span className="text-foreground font-semibold">{fmtPrice(p.now)}</span>{`
`}<span className="text-bear">{`T1↓ ${fmtPrice(p.t1Dn)} >> T2↓ ${fmtPrice(p.t2Dn)} >> T3↓ ${fmtPrice(p.t3Dn)}`}</span>{`
`}<span className="text-muted-foreground">@everyone</span>{`

Bias: `}<span className={`${biasColor} font-bold`}>{p.bias}</span>{p.biasReason ? ` — ${p.biasReason}` : ""}{`
Context: ${p.context}${p.events ? `\nEvents: ${p.events}` : ""}`}
      </pre>
    </Panel>
  );
}

function LevelRail({ plan: p }: { plan: PlanView }) {
  const rows = [
    { label: "T3↑", price: p.t3Up, tone: "bull" },
    { label: "T2↑", price: p.t2Up, tone: "bull" },
    { label: "T1↑", price: p.t1Up, tone: "bull" },
    { label: "Pivot", price: p.pivot, tone: "pivot" },
    { label: "T1↓", price: p.t1Dn, tone: "bear" },
    { label: "T2↓", price: p.t2Dn, tone: "bear" },
    { label: "T3↓", price: p.t3Dn, tone: "bear" },
  ] as const;
  return (
    <Panel title="Level Rail">
      <div className="space-y-1">
        {rows.map((r) => {
          const dist = r.price - p.now;
          const tone =
            r.tone === "bull" ? "text-bull" : r.tone === "bear" ? "text-bear" : "text-pivot";
          return (
            <div
              key={r.label}
              className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-2 rounded-md border border-border/60 bg-surface-1 px-3 py-2"
            >
              <span className={`mono text-xs font-bold ${tone}`}>{r.label}</span>
              <span className="mono text-sm font-semibold">{fmtPrice(r.price)}</span>
              <span className="mono text-[11px] text-muted-foreground">
                {dist >= 0 ? "+" : ""}{dist.toFixed(2)}
              </span>
            </div>
          );
        })}
        <div className="mt-2 rounded-md border border-dashed border-border bg-surface-2/60 px-3 py-2 text-center">
          <div className="label-xs">Reference</div>
          <div className="mono text-xl font-bold">{fmtPrice(p.now)}</div>
        </div>
      </div>
    </Panel>
  );
}

function PlanResultsCard() {
  const r = planResult;
  const text = resultToText(r);
  const mark = (b: boolean) => (b ? "✅" : "❌");
  return (
    <Panel
      title={`Plan Results — Previous Session`}
      right={
        <div className="flex items-center gap-2">
          <span className="mono rounded-md border border-border bg-surface-2 px-2 py-0.5 text-xs">
            Score {r.score}/100
          </span>
          <CopyBtn text={text} />
        </div>
      }
    >
      <pre className="mono whitespace-pre-wrap text-[12.5px] leading-relaxed">
{`📊 Daily Plan Results — ${r.date}

Bias: ${r.bias} ${mark(r.biasHit)}
Pivot ${fmtPrice(r.pivot)}: ${r.pivotHeld ? "Held ✅" : "Failed ❌"}

`}<span className="text-bull">{r.ups.map((t, i) => `↑ T${i + 1} ${fmtPrice(t.price)}: ${t.hit ? `✅ Hit ${t.time}` : `❌ Missed`}`).join("\n")}</span>{`

`}<span className="text-bear">{r.dns.map((t, i) => `↓ T${i + 1} ${fmtPrice(t.price)}: ${t.hit ? `✅ Hit ${t.time}` : `❌ Missed`}`).join("\n")}</span>{`

Session: H ${fmtPrice(r.high)} / L ${fmtPrice(r.low)} / C ${fmtPrice(r.close)}
Score: ${r.score}/100
`}<span className="text-muted-foreground">@everyone</span>
      </pre>
    </Panel>
  );
}
