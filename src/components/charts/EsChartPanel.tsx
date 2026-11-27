import { useEffect, useMemo, useRef, useState } from "react";
import { EsCandleChart, type ChartHandle, type PriceLine } from "./Charts";
import { ChartToolbar, type Symbol, type Timeframe } from "./ChartToolbar";
import { OpeningRangesPopover } from "./OpeningRangesPopover";
import { dailyPlan, esCandles, spxCandles } from "@/lib/mock/data";
import { resampleCandles, filterRTH } from "@/lib/chart-utils";
import { fmtPrice } from "@/lib/format";
import { useOpeningRanges } from "@/lib/use-opening-ranges";
import { computeZones } from "@/lib/opening-ranges";
import { computeProfileLevels } from "@/lib/profile-levels";
import { useSpxFeed } from "@/lib/use-spx-feed";
import { useGex } from "@/lib/use-spx-gex";
import type { ExpirySet, GexLevel } from "@/lib/gex-engine";
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

const GEX_STALE_SEC = 180;

function gexColor(kind: GexLevel["kind"], alpha = 1): string {
  const a = (x: number) => (x * alpha).toFixed(2);
  switch (kind) {
    case "callWall":
      return `rgba(34,197,94,${a(0.95)})`;
    case "call":
      return `rgba(34,197,94,${a(0.55)})`;
    case "putWall":
      return `rgba(239,68,68,${a(0.95)})`;
    case "put":
      return `rgba(239,68,68,${a(0.55)})`;
    case "hvl":
      return `rgba(56,189,248,${a(0.95)})`;
    case "flip":
      return `rgba(56,189,248,${a(0.5)})`;
    default:
      return `rgba(148,163,184,${a(0.85)})`;
  }
}

function makeGexLines(levels: GexLevel[], stale: boolean): PriceLine[] {
  const alpha = stale ? 0.35 : 1;
  return levels.map((g) => ({
    price: g.price,
    color: gexColor(g.kind, alpha),
    label: g.label,
    style:
      g.kind === "hvl" || g.kind === "callWall" || g.kind === "putWall"
        ? "solid"
        : g.kind === "flip"
          ? "dotted"
          : "dashed",
    width: g.kind === "hvl" || g.kind === "callWall" || g.kind === "putWall" ? 2 : 1,
  }));
}

const GEX_ERRORS: Record<string, string> = {
  no_source: "no broker data source configured",
  reauth_required: "Schwab needs to be reconnected (Settings → Brokers)",
  empty: "no options returned for this expiry set",
  quality: "too many contracts failed data-quality checks",
  fetch_failed: "broker request failed",
  request_failed: "request failed",
};

const EXPIRY_SETS: { id: ExpirySet; label: string }[] = [
  { id: "0dte", label: "0DTE" },
  { id: "sigma4", label: "Σ 4DTE" },
  { id: "monthly", label: "Monthly" },
];

interface EsChartPanelProps {
  initialSymbol?: Symbol;
}

export function EsChartPanel({ initialSymbol = "ES" }: EsChartPanelProps = {}) {
  const [timeframe, setTimeframe] = useState<Timeframe>("2m");
  const [symbol, setSymbol] = useState<Symbol>(initialSymbol);
  const [showGex, setShowGex] = useState(false);
  const [expirySet, setExpirySet] = useState<ExpirySet>("0dte");
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));
  const [isFullscreen, setIsFullscreen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ChartHandle>(null);

  const { candles: spxLive, isLive: spxIsLive, source: spxSource } = useSpxFeed(timeframe);
  const gexUnderlying = symbol === "NQ" ? "QQQ" : "SPX";
  const { result: gex, lastError: gexError } = useGex(gexUnderlying, expirySet, showGex);

  useEffect(() => {
    if (!showGex) return;
    const id = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 5000);
    return () => clearInterval(id);
  }, [showGex]);
  const futuresRoot = symbol === "NQ" ? "/NQ" : "/ES";
  const {
    candles: esLive,
    base1m: esBase1m,
    isLive: esIsLive,
    source: esSource,
  } = useEsFeed(timeframe, futuresRoot);

  // Prefer live feeds; fall back silently to mock if the feed is empty
  // (no Schwab token / not entitled / API down).
  const source =
    symbol === "SPX"
      ? spxLive.length > 0
        ? spxLive
        : spxCandles
      : esLive.length > 0
        ? esLive
        : esCandles;
  // Live feeds are already resampled server-side; mock candles still need it.
  const useRawSource =
    (symbol === "SPX" && spxLive.length > 0) || (symbol !== "SPX" && esLive.length > 0);

  const data = useMemo(() => {
    if (useRawSource) return source;
    if (timeframe === "RTH") return filterRTH(source);
    return resampleCandles(source, TF_MIN[timeframe]);
  }, [timeframe, source, useRawSource]);

  // Map source-chain levels to the displayed instrument (spec v0.2):
  //  SPX -> SPX: native. SPX -> /ES: additive basis. QQQ -> /NQ: proportional ratio.
  // Futures mapping needs a live futures price; without one, no levels are drawn.
  const futLast = esBase1m.length > 0 ? esBase1m[esBase1m.length - 1].close : null;
  const mapping = useMemo(() => {
    const spot = gex?.spot ?? null;
    if (symbol === "SPX") return { ok: spot != null, label: "Native SPX", map: (p: number) => p };
    if (spot == null || futLast == null)
      return { ok: false, label: "No live futures price to map levels", map: (p: number) => p };
    if (symbol === "ES") {
      const basis = futLast - spot;
      return {
        ok: true,
        label: `Mapped from SPX · basis ${basis >= 0 ? "+" : ""}${basis.toFixed(2)}`,
        map: (p: number) => Math.round((p + basis) * 4) / 4,
      };
    }
    const ratio = futLast / spot;
    return {
      ok: true,
      label: `Mapped from QQQ · ×${ratio.toFixed(3)}`,
      map: (p: number) => Math.round(p * ratio * 4) / 4,
    };
  }, [symbol, gex?.spot, futLast]);

  const gexAge = gex?.levels.length ? nowSec - gex.asOf : null;
  const gexStale = gexAge != null && gexAge > GEX_STALE_SEC;

  const activeGex: GexLevel[] = useMemo(() => {
    if (!gex?.levels.length || !mapping.ok) return [];
    return gex.levels.map((g) => ({ ...g, price: mapping.map(g.price) }));
  }, [gex, mapping]);

  const lines = useMemo(
    () => (showGex ? [...planLines, ...makeGexLines(activeGex, gexStale)] : planLines),
    [showGex, activeGex, gexStale],
  );

  const { configs: orConfigs, setConfigs: setOrConfigs, reset: resetOr } = useOpeningRanges();
  const zones = useMemo(() => computeZones(source, orConfigs, symbol), [source, orConfigs, symbol]);

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
          <span>
            {symbol} · {timeframe} · Daily Plan Levels
          </span>
          {((symbol === "SPX" && spxIsLive) || (symbol !== "SPX" && esIsLive)) && (
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
        <GexStatusBar
          gex={gex}
          error={gexError}
          levels={activeGex}
          mappingLabel={mapping.label}
          mappingOk={mapping.ok}
          age={gexAge}
          stale={gexStale}
          priceIsLive={useRawSource}
          lastPrice={data.length ? data[data.length - 1].close : null}
          expirySet={expirySet}
          onExpirySet={setExpirySet}
        />
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

function fmtAge(sec: number | null): string {
  if (sec == null) return "";
  if (sec < 60) return `${sec}s ago`;
  return `${Math.floor(sec / 60)}m ago`;
}

function GexStatusBar({
  gex,
  error,
  levels,
  mappingLabel,
  mappingOk,
  age,
  stale,
  priceIsLive,
  lastPrice,
  expirySet,
  onExpirySet,
}: {
  gex: ReturnType<typeof useGex>["result"];
  error: ReturnType<typeof useGex>["lastError"];
  levels: GexLevel[];
  mappingLabel: string;
  mappingOk: boolean;
  age: number | null;
  stale: boolean;
  priceIsLive: boolean;
  lastPrice: number | null;
  expirySet: ExpirySet;
  onExpirySet: (s: ExpirySet) => void;
}) {
  const hvl = levels.find((l) => l.kind === "hvl");
  const flipCount = levels.filter((l) => l.kind === "hvl" || l.kind === "flip").length;
  const pos = gex?.regime === "positive";
  const hasLevels = levels.length > 0;
  return (
    <div className="flex flex-col gap-1.5 border-b border-border bg-surface-2/40 px-3 py-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="inline-flex rounded border border-border p-0.5">
          {EXPIRY_SETS.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => onExpirySet(e.id)}
              className={`mono rounded px-1.5 py-0.5 text-[10px] ${
                expirySet === e.id
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {e.label}
            </button>
          ))}
        </div>
        {hasLevels && gex?.regime && (
          <span
            className={`mono inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] ${
              stale
                ? "border-border text-muted-foreground"
                : pos
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
                  : "border-red-500/40 bg-red-500/10 text-red-500"
            }`}
            title={`Net GEX ${(gex.netGex / 1e9).toFixed(2)}B per 1% move`}
          >
            {pos ? "Positive γ" : "Negative γ"}
            {hvl && lastPrice != null
              ? ` · ${lastPrice - hvl.price >= 0 ? "+" : ""}${(lastPrice - hvl.price).toFixed(2)} vs HVL`
              : " · no flip in range"}
            {flipCount > 1 ? ` · ${flipCount} flips` : ""}
          </span>
        )}
        {hasLevels && (
          <span className="mono text-[10px] text-muted-foreground">
            {gex?.source?.toUpperCase()} · {mappingLabel} · {gex?.expirations.join(", ")} ·{" "}
            {fmtAge(age)}
          </span>
        )}
        {gex?.quality?.status === "degraded" && (
          <span className="mono rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-500">
            Degraded · {Math.round(gex.quality.droppedOiShare * 100)}% OI dropped
          </span>
        )}
        {stale && (
          <span className="mono rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-500">
            Stale · last good levels {fmtAge(age)}
          </span>
        )}
        {!priceIsLive && hasLevels && (
          <span className="mono rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-500">
            Price feed offline · sample candles
          </span>
        )}
        {!hasLevels && (
          <span className="mono text-[10px] text-amber-500">
            GEX unavailable ·{" "}
            {!mappingOk && gex?.levels.length
              ? mappingLabel
              : error
                ? (GEX_ERRORS[error] ?? error)
                : "loading…"}
          </span>
        )}
        {hasLevels && error && !stale && (
          <span className="mono text-[10px] text-amber-500">
            Last refresh failed · {GEX_ERRORS[error] ?? error}
          </span>
        )}
      </div>
      {hasLevels && (
        <div className="flex flex-wrap items-center gap-1.5">
          {levels.map((g) => (
            <span
              key={g.label}
              className="mono inline-flex items-center gap-1 rounded border border-border bg-surface-1 px-1.5 py-0.5 text-[10px]"
              title={
                g.gex != null ? `${(g.gex / 1e6).toFixed(0)}M per 1% move` : "Net GEX crosses zero"
              }
            >
              <span className="h-2 w-2 rounded-full" style={{ background: gexColor(g.kind) }} />
              <span className="text-muted-foreground">{g.label}</span>
              <span className="font-semibold text-foreground">{fmtPrice(g.price)}</span>
            </span>
          ))}
          <span className="mono text-[10px] text-muted-foreground/70">
            Modeled estimates from open interest, not actual dealer positions.
          </span>
        </div>
      )}
    </div>
  );
}
