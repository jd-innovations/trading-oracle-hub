import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Panel } from "@/components/layout/AppShell";
import { balanceZones } from "@/lib/mock/data";
import { fmtPrice } from "@/lib/format";
import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";

export const Route = createFileRoute("/balance-zones")({
  head: () => ({
    meta: [
      { title: "Balance Zones — JD Trading Planner" },
      { name: "description", content: "Daily and weekly OTF detection with balance zone breakout status." },
    ],
  }),
  component: ZonesPage,
});

function ZonesPage() {
  const daily = balanceZones.filter((z) => z.timeframe === "Daily");
  const weekly = balanceZones.filter((z) => z.timeframe === "Weekly");
  return (
    <AppShell title="Balance Zones" subtitle="OTF · Breakouts">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <ZoneGroup title="Daily" zones={daily} />
        <ZoneGroup title="Weekly" zones={weekly} />
      </div>
    </AppShell>
  );
}

function ZoneGroup({ title, zones }: { title: string; zones: typeof balanceZones }) {
  return (
    <Panel title={title}>
      <div className="space-y-3">
        {zones.map((z) => {
          const Otf = z.otf === "Up" ? ArrowUpRight : z.otf === "Down" ? ArrowDownRight : Minus;
          const otfTone =
            z.otf === "Up" ? "text-bull bg-bull/10 border-bull/30" :
            z.otf === "Down" ? "text-bear bg-bear/10 border-bear/30" :
            "text-muted-foreground bg-surface-2 border-border";
          const brTone =
            z.breakout === "Above" ? "text-bull bg-bull/10 border-bull/30" :
            z.breakout === "Below" ? "text-bear bg-bear/10 border-bear/30" :
            "text-info bg-info/10 border-info/30";
          return (
            <div key={z.label} className="rounded-md border border-border bg-surface-1 p-3">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                <h3 className="text-sm font-semibold">{z.label}</h3>
                <div className="flex gap-1">
                  <span className={`mono inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${otfTone}`}>
                    <Otf className="h-3 w-3" /> OTF {z.otf}
                  </span>
                  <span className={`mono rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${brTone}`}>
                    {z.breakout}
                  </span>
                </div>
              </div>
              <div className="mt-3">
                <ZoneVisual high={z.high} hb={z.halfback} low={z.low} />
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function ZoneVisual({ high, hb, low }: { high: number; hb: number; low: number }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
      <div className="relative h-32 overflow-hidden rounded border border-border bg-surface-2">
        <div className="absolute inset-x-0 top-0 border-b border-bull/40 bg-bull/[0.08] px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-bull">High</div>
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 border-y border-dashed border-pivot/40 bg-pivot/[0.06] px-2 py-0.5 text-center text-[10px] font-semibold uppercase tracking-wider text-pivot">Halfback</div>
        <div className="absolute inset-x-0 bottom-0 border-t border-bear/40 bg-bear/[0.08] px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-bear">Low</div>
      </div>
      <div className="mono flex flex-col justify-between text-right text-xs">
        <span className="text-bull">{fmtPrice(high)}</span>
        <span className="text-pivot">{fmtPrice(hb)}</span>
        <span className="text-bear">{fmtPrice(low)}</span>
      </div>
    </div>
  );
}
