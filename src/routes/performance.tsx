import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell, Panel } from "@/components/layout/AppShell";
import { EquityChart } from "@/components/charts/Charts";
import { perfWindows, equityCurve } from "@/lib/mock/data";

export const Route = createFileRoute("/performance")({
  head: () => ({
    meta: [
      { title: "Performance — JD Trading Planner" },
      { name: "description", content: "Bias accuracy, target hit rates, and equity curve across rolling windows." },
    ],
  }),
  component: PerfPage,
});

function PerfPage() {
  const [windowKey, setWindowKey] = useState<"L5" | "L10" | "L20" | "All">("L10");
  const w = perfWindows.find((p) => p.label === windowKey)!;

  const tiles = [
    { k: "Bias Acc", v: w.biasAcc },
    { k: "Pivot Hold", v: w.pivotHold },
    { k: "Extension", v: w.extension },
    { k: "Avg Score", v: w.avgScore },
  ];

  return (
    <AppShell title="Performance" subtitle="Hit Rates · Rolling">
      <Panel
        title="Window"
        right={
          <div className="flex rounded-md border border-border bg-surface-1 p-0.5">
            {(["L5", "L10", "L20", "All"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setWindowKey(k)}
                className={`mono rounded px-2.5 py-1 text-xs font-semibold ${
                  windowKey === k ? "bg-surface-2 text-foreground" : "text-muted-foreground"
                }`}
              >
                {k}
              </button>
            ))}
          </div>
        }
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {tiles.map((t) => (
            <div key={t.k} className="rounded-md border border-border bg-surface-1 p-3">
              <div className="label-xs">{t.k}</div>
              <div className="mono mt-1 text-2xl font-bold">{t.v}<span className="text-base text-muted-foreground">%</span></div>
            </div>
          ))}
        </div>
      </Panel>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Panel title="Equity Curve" className="lg:col-span-2">
          <EquityChart data={equityCurve} />
        </Panel>
        <Panel title="Target Hit Rates">
          <div className="space-y-3">
            <Group label="Upside" rows={[["T1", w.t1Up], ["T2", w.t2Up], ["T3", w.t3Up]]} tone="bull" />
            <Group label="Downside" rows={[["T1", w.t1Dn], ["T2", w.t2Dn], ["T3", w.t3Dn]]} tone="bear" />
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}

function Group({
  label,
  rows,
  tone,
}: {
  label: string;
  rows: Array<[string, number]>;
  tone: "bull" | "bear";
}) {
  const color = tone === "bull" ? "bg-bull" : "bg-bear";
  return (
    <div>
      <div className="label-xs mb-1.5">{label}</div>
      <div className="space-y-1.5">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[28px_minmax(0,1fr)_44px] items-center gap-2">
            <span className="mono text-xs font-bold">{k}</span>
            <div className="h-2 overflow-hidden rounded-full bg-surface-2">
              <div className={`h-full ${color}`} style={{ width: `${v}%` }} />
            </div>
            <span className="mono text-right text-xs">{v}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
