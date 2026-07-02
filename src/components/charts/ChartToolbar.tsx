import { Maximize2, Minimize2, Activity, Scan } from "lucide-react";

export type Timeframe = "2m" | "5m" | "15m" | "30m" | "RTH";
export const TIMEFRAMES: Timeframe[] = ["2m", "5m", "15m", "30m", "RTH"];

export type Symbol = "ES" | "NQ" | "SPX";
export const SYMBOLS: Symbol[] = ["ES", "NQ", "SPX"];

interface Props {
  timeframe: Timeframe;
  onTimeframe: (tf: Timeframe) => void;
  symbol: Symbol;
  onSymbol: (s: Symbol) => void;
  showGex: boolean;
  onToggleGex: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onFit: () => void;
}

export function ChartToolbar({
  timeframe,
  onTimeframe,
  symbol,
  onSymbol,
  showGex,
  onToggleGex,
  isFullscreen,
  onToggleFullscreen,
  onFit,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface-1 px-2 py-1.5">
      <div className="inline-flex overflow-hidden rounded-md border border-border">
        {SYMBOLS.map((s) => (
          <button
            key={s}
            onClick={() => onSymbol(s)}
            className={`mono px-2 py-1 text-[11px] font-semibold transition-colors ${
              symbol === s
                ? "bg-foreground text-background"
                : "bg-surface-2 text-muted-foreground hover:text-foreground"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="inline-flex overflow-hidden rounded-md border border-border">
        {TIMEFRAMES.map((tf) => (
          <button
            key={tf}
            onClick={() => onTimeframe(tf)}
            className={`mono px-2 py-1 text-[11px] font-semibold transition-colors ${
              timeframe === tf
                ? "bg-foreground text-background"
                : "bg-surface-2 text-muted-foreground hover:text-foreground"
            }`}
          >
            {tf}
          </button>
        ))}
      </div>

      <button
        onClick={onToggleGex}
        className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
          showGex
            ? "border-info bg-info/15 text-info"
            : "border-border bg-surface-2 text-muted-foreground hover:text-foreground"
        }`}
      >
        <Activity className="h-3 w-3" />
        GEX
      </button>

      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={onFit}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Fit chart to screen"
        >
          <Scan className="h-3 w-3" />
          Fit
        </button>
        <button
          onClick={onToggleFullscreen}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
          aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        >
          {isFullscreen ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
          {isFullscreen ? "Exit" : "Fullscreen"}
        </button>
      </div>
    </div>
  );
}
