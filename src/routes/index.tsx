import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { AppShell, Panel } from "@/components/layout/AppShell";
import { EsChartPanel } from "@/components/charts/EsChartPanel";
import { TpoProfile } from "@/components/charts/TpoProfile";
import { dailyPlan, planResult } from "@/lib/mock/data";
import { fmtPrice, planToText, resultToText } from "@/lib/format";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Daily Plan — JD Trading Planner" },
      { name: "description", content: "Today's ES futures daily plan with targets, pivot, bias, and context." },
    ],
  }),
  component: PlanPage,
});

function PlanPage() {
  return (
    <AppShell title="Daily Plan" subtitle="Module 1 · ES Futures">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <DailyPlanCard />
          <EsChartPanel />
        </div>
        <div className="space-y-3">
          <LevelRail />
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

function DailyPlanCard() {
  const p = dailyPlan;
  const text = planToText(p);
  const biasColor =
    p.bias === "Bullish" ? "text-bull" : p.bias === "Bearish" ? "text-bear" : "text-info";
  return (
    <Panel
      title="Daily Plan (Discord Format)"
      right={<CopyBtn text={text} />}
    >
      <pre className="mono whitespace-pre-wrap break-words text-[12.5px] leading-relaxed text-foreground">
{`Daily Plan: ${p.symbol}
$ES FUTURES ${p.date}

`}<span className="text-bull">{`T3↑ ${fmtPrice(p.t3Up)} >> T2↑ ${fmtPrice(p.t2Up)} >> T1↑ ${fmtPrice(p.t1Up)}`}</span>{`
`}<span className="text-pivot">{`Daily Pivot: ${fmtPrice(p.pivot)}`}</span>{` / Now trading at `}<span className="text-foreground font-semibold">{fmtPrice(p.now)}</span>{`
`}<span className="text-bear">{`T1↓ ${fmtPrice(p.t1Dn)} >> T2↓ ${fmtPrice(p.t2Dn)} >> T3↓ ${fmtPrice(p.t3Dn)}`}</span>{`
`}<span className="text-muted-foreground">@everyone</span>{`

Bias: `}<span className={`${biasColor} font-bold`}>{p.bias}</span>{` — ${p.biasReason}
Context: ${p.context}${p.events ? `\nEvents: ${p.events}` : ""}`}
      </pre>
    </Panel>
  );
}

function LevelRail() {
  const p = dailyPlan;
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
          <div className="label-xs">Now Trading</div>
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
