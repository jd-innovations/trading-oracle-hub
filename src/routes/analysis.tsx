import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Panel } from "@/components/layout/AppShell";
import { TpoProfile } from "@/components/charts/TpoProfile";
import { nakedLevels, structuralFlags, balanceZones } from "@/lib/mock/data";
import { fmtPrice } from "@/lib/format";
import { AlertTriangle, Flag, Layers } from "lucide-react";

export const Route = createFileRoute("/analysis")({
  head: () => ({
    meta: [
      { title: "Market Profile Analysis — JD Trading Planner" },
      { name: "description", content: "TPO profile, naked levels, structural flags, and balance zones for the current ES session." },
    ],
  }),
  component: AnalysisPage,
});

function AnalysisPage() {
  return (
    <AppShell title="Profile Analysis" subtitle="Module 1 · TPO / Structure">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <Panel title="TPO Profile · RTH">
          <TpoProfile />
        </Panel>
        <div className="space-y-3">
          <Panel title="Naked Levels" right={<Layers className="h-3.5 w-3.5 text-muted-foreground" />}>
            <div className="divide-y divide-border">
              {nakedLevels.map((l) => (
                <div key={l.label + l.price} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 py-2.5">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{l.label}</div>
                    <div className="text-[11px] text-muted-foreground">{l.type} · {l.age} old</div>
                  </div>
                  <span className="mono text-sm font-semibold">{fmtPrice(l.price)}</span>
                  <span className="rounded-sm border border-border bg-surface-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                    {l.type}
                  </span>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="Structural Flags" right={<AlertTriangle className="h-3.5 w-3.5 text-pivot" />}>
            <div className="space-y-2">
              {structuralFlags.map((f) => (
                <div key={f.kind + f.price} className="rounded-md border border-border bg-surface-1 px-3 py-2">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                    <span className="flex items-center gap-1.5 text-sm font-semibold">
                      <Flag className="h-3.5 w-3.5 text-pivot" />
                      {f.kind}
                    </span>
                    <span className="mono text-sm">{fmtPrice(f.price)}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{f.detail}</p>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="Balance Zones (quick view)">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {balanceZones.map((z) => (
                <div key={z.label} className="rounded-md border border-border bg-surface-1 p-3">
                  <div className="label-xs">{z.label}</div>
                  <div className="mono mt-1 text-xs leading-relaxed">
                    <div>H <span className="text-foreground">{fmtPrice(z.high)}</span></div>
                    <div>½ <span className="text-pivot">{fmtPrice(z.halfback)}</span></div>
                    <div>L <span className="text-foreground">{fmtPrice(z.low)}</span></div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <span className="rounded-sm border border-border bg-surface-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wider">
                      OTF: {z.otf}
                    </span>
                    <span className="rounded-sm border border-border bg-surface-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wider">
                      {z.breakout}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
