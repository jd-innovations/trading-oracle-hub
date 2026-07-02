import { useEffect, useMemo, useRef, useState } from "react";
import { EsCandleChart, type ChartHandle, type PriceLine } from "./Charts";
import { ChartToolbar, type Symbol, type Timeframe } from "./ChartToolbar";
import { OpeningRangesPopover } from "./OpeningRangesPopover";
import { dailyPlan, esCandles, spxCandles, gexLevels } from "@/lib/mock/data";
import { resampleCandles, filterRTH } from "@/lib/chart-utils";
import { fmtPrice } from "@/lib/format";
import { useOpeningRanges } from "@/lib/use-opening-ranges";
import { computeZones } from "@/lib/opening-ranges";
import { computeProfileLevels } from "@/lib/profile-levels";
import { useSpxFeed } from "@/lib/use-spx-feed";
import { useSpxGex } from "@/lib/use-spx-gex";
import { useEsFeed } from "@/lib/use-es-feed";

const TF_MIN: Record<Timeframe, number> = { "2m": 2, "5m": 5, "15m": 15, "30m": 30, RTH: 2 };

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

function makeGexLines(levels: { label: string; price: number }[]): PriceLine[] {
  return levels.map((g) => ({
    price: g.price,
    color: gexColor(g.label),
    label: `GEX · ${g.label}`,
    style: "dashed",
  }));
}

interface EsChartPanelProps {
  initialSymbol?: Symbol;
}

export function EsChartPanel({ initialSymbol = "ES" }: EsChartPanelProps = {}) {
  const [timeframe, setTimeframe] = useState<Timeframe>("2m");
  const [symbol, setSymbol] = useState<Symbol>(initialSymbol);
  const [showGex, setShowGex] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ChartHandle>(null);

  const { candles: spxLive, isLive: spxIsLive, source: spxSource } = useSpxFeed(timeframe);
  const {
    levels: spxGexLive,
    asOf: spxGexAsOf,
    spot: spxGexSpot,
    isLive: spxGexIsLive,
    source: spxGexSource,
  } = useSpxGex(showGex && symbol !== "NQ");
  const futuresRoot = symbol === "NQ" ? "/NQ" : "/ES";
  const { candles: esLive, base1m: esBase1m, isLive: esIsLive, source: esSource } = useEsFeed(timeframe, futuresRoot);


  // Prefer live feeds; fall back silently to mock if the feed is empty
  // (no Schwab token / not entitled / API down).
  const source =
    symbol === "SPX"
      ? (spxLive.length > 0 ? spxLive : spxCandles)
      : (esLive.length > 0 ? esLive : esCandles);
  // Live feeds are already resampled server-side; mock candles still need it.
  const useRawSource =
    (symbol === "SPX" && spxLive.length > 0) ||
    (symbol !== "SPX" && esLive.length > 0);

  const data = useMemo(() => {
    if (useRawSource) return source;
    if (timeframe === "RTH") return filterRTH(source);
    return resampleCandles(source, TF_MIN[timeframe]);
  }, [timeframe, source, useRawSource]);

  // SPX → ES basis: ES futures trade at a premium/discount to SPX cash.
  // basis = lastESClose - spxSpot; project SPX GEX strikes onto ES prices.
  // NQ has no SPX-based GEX projection.
  const esBasis = useMemo(() => {
    if (symbol !== "ES" || spxGexSpot == null) return 0;
    const src = esBase1m.length > 0 ? esBase1m : esCandles;
    if (!src.length) return 0;
    return src[src.length - 1].close - spxGexSpot;
  }, [symbol, spxGexSpot, esBase1m]);

  const activeGex = useMemo(() => {
    if (symbol === "NQ") return [];
    if (symbol === "SPX") {
      return spxGexLive.length > 0 ? spxGexLive : gexLevels;
    }
    // ES: project live SPX GEX through basis when available
    if (spxGexLive.length > 0) {
      return spxGexLive.map((g) => ({ ...g, price: g.price + esBasis }));
    }
    return gexLevels;
  }, [symbol, spxGexLive, esBasis]);

  const lines = useMemo(
    () => (showGex && symbol !== "NQ" ? [...planLines, ...makeGexLines(activeGex)] : planLines),
    [showGex, symbol, activeGex],
  );

  const { configs: orConfigs, setConfigs: setOrConfigs, reset: resetOr } = useOpeningRanges();
  const zones = useMemo(
    () => computeZones(source, orConfigs, symbol),
    [source, orConfigs, symbol],
  );

  const profileLevels = useMemo(() => {
    if (symbol === "SPX") return [];
    // Always compute profile levels from the finest-grained bars available
    // (1-minute live feed, falling back to mock 2m). Computing them from the
    // already-resampled display data caused 30m POCs to be derived from
    // single 30m candles, which produced incorrect prices.
    const profileBars = esBase1m.length > 0 ? esBase1m : esCandles;
    return computeProfileLevels(profileBars, { include30m: timeframe === "30m" });
  }, [symbol, esBase1m, timeframe]);

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
        <h3 className="label-xs flex items-center gap-2">
          <span>{symbol} · {timeframe} · Daily Plan Levels</span>
          {((symbol === "SPX" && spxIsLive) || (symbol === "ES" && esIsLive)) && (
            <span
              className="inline-flex items-center gap-1 text-[10px] text-emerald-500"
              title={`Live ${symbol === "SPX" ? spxSource : esSource} feed`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              LIVE · {(symbol === "SPX" ? spxSource : esSource).toUpperCase()}
            </span>
          )}

        </h3>
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
        <div className="flex flex-wrap items-center gap-1.5 border-b border-border bg-surface-2/40 px-3 py-1.5">
          {spxGexIsLive && (
            <span
              className="mono inline-flex items-center gap-1 rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-500"
              title={`${spxGexSource} SPX GEX · ${new Date(spxGexAsOf * 1000).toLocaleTimeString()}${
                symbol === "ES" ? ` · basis ${esBasis >= 0 ? "+" : ""}${esBasis.toFixed(2)}` : ""
              }`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              GEX · {spxGexSource.toUpperCase()}
              {symbol === "ES" && (
                <span className="ml-1 text-emerald-400/70">
                  · ES{esBasis >= 0 ? "+" : ""}{esBasis.toFixed(1)}
                </span>
              )}
            </span>
          )}

          {activeGex.map((g) => (
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
        <EsCandleChart
          ref={chartRef}
          data={data}
          lines={lines}
          zones={zones}
          profileLevels={profileLevels}
          height={chartHeight}
        />
      </div>
    </div>
  );
}
