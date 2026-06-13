import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Panel } from "@/components/layout/AppShell";
import { EsCandleChart } from "@/components/charts/Charts";
import { ironFly, gexLevels, ironFlyFeed, spxCandles } from "@/lib/mock/data";
import { fmtPrice } from "@/lib/format";

export const Route = createFileRoute("/iron-fly")({
  head: () => ({
    meta: [
      { title: "SPX Iron Fly — JD Trading Planner" },
      { name: "description", content: "Live SPX iron fly recommendation with GEX levels and 30-minute update feed." },
    ],
  }),
  component: IronFlyPage,
});

function IronFlyPage() {
  const f = ironFly;
  return (
    <AppShell title="SPX Iron Fly" subtitle="Module 2 · 0DTE · GEX-driven">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Panel
          title={`Recommendation · Generated ${f.generatedAt}`}
          right={<span className="rounded-md border border-bull/30 bg-bull/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-bull">Live</span>}
          className="lg:col-span-2"
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Symbol" value={f.symbol} />
            <Stat label="Expiry" value={f.expiry} />
            <Stat label="Spot" value={fmtPrice(f.spot)} />
            <Stat label="Width" value={`±${f.width}`} />
            <Stat label="Short Strikes" value={fmtPrice(f.shortCall)} tone="pivot" />
            <Stat label="Long Call" value={fmtPrice(f.longCall)} tone="bull" />
            <Stat label="Long Put" value={fmtPrice(f.longPut)} tone="bear" />
            <Stat label="Credit" value={`$${fmtPrice(f.credit)}`} tone="bull" />
            <Stat label="Max Risk" value={`$${fmtPrice(f.maxRisk)}`} tone="bear" />
            <Stat label="BE Low" value={fmtPrice(f.beLow)} />
            <Stat label="BE High" value={fmtPrice(f.beHigh)} />
            <Stat label="P&L" value="+$5.20" tone="bull" />
          </div>
        </Panel>
        <Panel title="GEX Levels">
          <div className="space-y-2">
            {gexLevels.map((g) => (
              <div key={g.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md border border-border bg-surface-1 px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{g.label}</div>
                  <div className="mt-1 h-1 w-full overflow-hidden rounded bg-surface-2">
                    <div className="h-full bg-info" style={{ width: `${g.weight * 100}%` }} />
                  </div>
                </div>
                <span className="mono text-sm font-semibold">{fmtPrice(g.price)}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Panel title="SPX · 2-min" className="lg:col-span-2">
          <EsCandleChart
            data={spxCandles}
            lines={[
              { price: f.longCall, color: "rgba(34,197,94,0.8)", label: "LC" },
              { price: f.shortCall, color: "rgba(234,179,8,0.95)", label: "SHORT", style: "dashed" },
              { price: f.longPut, color: "rgba(239,68,68,0.8)", label: "LP" },
              { price: f.beHigh, color: "rgba(99,102,241,0.6)", label: "BE+", style: "dashed" },
              { price: f.beLow, color: "rgba(99,102,241,0.6)", label: "BE-", style: "dashed" },
            ]}
          />
        </Panel>
        <Panel title="30-Min Update Feed">
          <ol className="relative space-y-3 border-l border-border pl-4">
            {ironFlyFeed.map((u, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[19px] top-1.5 h-2 w-2 rounded-full bg-info" />
                <div className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-2">
                  <span className="mono text-xs font-bold text-muted-foreground">{u.time}</span>
                  <span className={`rounded-sm border px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${
                    u.tag === "Open" ? "border-bull/30 bg-bull/10 text-bull"
                    : u.tag === "Adjust" ? "border-pivot/30 bg-pivot/10 text-pivot"
                    : u.tag === "Alert" ? "border-bear/30 bg-bear/10 text-bear"
                    : "border-border bg-surface-2 text-muted-foreground"
                  }`}>{u.tag}</span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-foreground">{u.body}</p>
              </li>
            ))}
          </ol>
        </Panel>
      </div>
    </AppShell>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "bull" | "bear" | "pivot" }) {
  const c = tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : tone === "pivot" ? "text-pivot" : "text-foreground";
  return (
    <div className="rounded-md border border-border bg-surface-1 px-3 py-2">
      <div className="label-xs">{label}</div>
      <div className={`mono mt-0.5 text-sm font-semibold ${c}`}>{value}</div>
    </div>
  );
}
