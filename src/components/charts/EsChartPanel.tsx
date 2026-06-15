import { useEffect, useMemo, useRef, useState } from "react";
import { EsCandleChart, type ChartHandle, type PriceLine } from "./Charts";
import { ChartToolbar, type Symbol, type Timeframe } from "./ChartToolbar";
import { OpeningRangesPopover } from "./OpeningRangesPopover";
import { dailyPlan, esCandles, spxCandles, gexLevels } from "@/lib/mock/data";
import { resampleCandles, filterRTH } from "@/lib/chart-utils";
import { fmtPrice } from "@/lib/format";
import { useOpeningRanges } from "@/lib/use-opening-ranges";
import { computeZones } from "@/lib/opening-ranges";

const TF_MIN: Record<Timeframe, number> = { "2m": 2, "5m": 5, "15m": 15, RTH: 2 };

const planLines: PriceLine[] = [
  { price: dailyPlan.t3Up, color: "rgba(34,197,94,0.9)", label: "T3↑" },
  { price: dailyPlan.t2Up, color: "rgba(34,197,94,0.7)", label: "T2↑" },
  { price: dailyPlan.t1Up, color: "rgba(34,197,94,0.5)", label: "T1↑" },
  { price: dailyPlan.pivot, color: "rgba(234,179,8,0.95)", label: "Pivot", style: "dashed" },
  { price: dailyPlan.t1Dn, color: "rgba(239,68,68,0.5)", label: "T1↓" },
  { price: dailyPlan.t2Dn, color: "rgba(239,68,68,0.7)", label: "T2↓" },
  { price: dailyPlan.t3Dn, color: "rgba(239,68,68,0.9)", label: "T3↓" },
];

function gexColor(label: string): string {
  if (label.includes("Call")) return "rgba(34,197,94,0.95)";
  if (label.includes("Put")) return "rgba(239,68,68,0.95)";
  if (label.includes("Flip")) return "rgba(234,179,8,0.9)";
  return "rgba(148,163,184,0.85)";
}

const gexLines: PriceLine[] = gexLevels.map((g) => ({
  price: g.price,
  color: gexColor(g.label),
  label: `GEX · ${g.label}`,
  style: "dashed",
}));

export function EsChartPanel() {
  const [timeframe, setTimeframe] = useState<Timeframe>("2m");
  const [symbol, setSymbol] = useState<Symbol>("ES");
  const [showGex, setShowGex] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ChartHandle>(null);

  const source = symbol === "ES" ? esCandles : spxCandles;

  const data = useMemo(() => {
    if (timeframe === "RTH") return filterRTH(source);
    return resampleCandles(source, TF_MIN[timeframe]);
  }, [timeframe, source]);

  const lines = useMemo(
    () => (showGex ? [...planLines, ...gexLines] : planLines),
    [showGex],
  );

  const { configs: orConfigs, setConfigs: setOrConfigs, reset: resetOr } = useOpeningRanges();
  const zones = useMemo(
    () => computeZones(source, orConfigs, symbol),
    [source, orConfigs, symbol],
  );

  const handleFit = () => chartRef.current?.fitContent();

  const toggleFullscreen = async () => {
    const el = wrapperRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) {
        if (el.requestFullscreen) {
          await el.requestFullscreen();
          return;
        }
      } else if (document.exitFullscreen) {
        await document.exitFullscreen();
        return;
      }
    } catch {
      // Fall back to CSS fullscreen below (e.g. iframe-blocked Fullscreen API)
    }
    setIsFullscreen((v) => !v);
  };

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    if (!isFullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isFullscreen]);

  const chartHeight = isFullscreen
    ? typeof window !== "undefined"
      ? window.innerHeight - 96
      : 600
    : 320;

  return (
    <div
      ref={wrapperRef}
      className={
        isFullscreen
          ? "fixed inset-0 z-50 flex flex-col bg-background"
          : "rounded-md border border-border bg-card"
      }
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <h3 className="label-xs">{symbol} · {timeframe} · Daily Plan Levels</h3>
        <OpeningRangesPopover
          configs={orConfigs}
          onChange={setOrConfigs}
          onReset={resetOr}
          symbol={symbol}
        />
      </div>
      <ChartToolbar
        timeframe={timeframe}
        onTimeframe={setTimeframe}
        symbol={symbol}
        onSymbol={setSymbol}
        showGex={showGex}
        onToggleGex={() => setShowGex((v) => !v)}
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggleFullscreen}
        onFit={handleFit}
      />
      {showGex && (
        <div className="flex flex-wrap gap-1.5 border-b border-border bg-surface-2/40 px-3 py-1.5">
          {gexLevels.map((g) => (
            <span
              key={g.label}
              className="mono inline-flex items-center gap-1 rounded border border-border bg-surface-1 px-1.5 py-0.5 text-[10px]"
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: gexColor(g.label) }}
              />
              <span className="text-muted-foreground">{g.label}</span>
              <span className="font-semibold text-foreground">{fmtPrice(g.price)}</span>
            </span>
          ))}
        </div>
      )}
      <div className="flex-1 p-2">
        <EsCandleChart ref={chartRef} data={data} lines={lines} height={chartHeight} />
      </div>
    </div>
  );
}
