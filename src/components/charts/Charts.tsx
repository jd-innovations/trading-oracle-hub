import { useEffect, useRef } from "react";

export interface PriceLine {
  price: number;
  color: string;
  label: string;
  style?: "solid" | "dashed";
}

export function EsCandleChart({
  data,
  lines = [],
  height = 320,
}: {
  data: Array<{ time: number; open: number; high: number; low: number; close: number }>;
  lines?: PriceLine[];
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let disposed = false;
    let chart: any;
    let resizeObserver: ResizeObserver | undefined;

    (async () => {
      const lib = await import("lightweight-charts");
      if (disposed || !containerRef.current) return;
      const styles = getComputedStyle(document.documentElement);
      const text = styles.getPropertyValue("--foreground").trim() || "#ddd";
      const grid = styles.getPropertyValue("--grid").trim() || "#333";
      const bg = styles.getPropertyValue("--card").trim() || "#111";

      chart = lib.createChart(containerRef.current, {
        height,
        layout: {
          background: { type: lib.ColorType.Solid, color: `oklch(${bg})` },
          textColor: `oklch(${text})`,
          fontFamily:
            "JetBrains Mono, ui-monospace, Menlo, monospace",
          fontSize: 11,
        },
        grid: {
          vertLines: { color: `oklch(${grid})` },
          horzLines: { color: `oklch(${grid})` },
        },
        rightPriceScale: { borderColor: `oklch(${grid})` },
        timeScale: { borderColor: `oklch(${grid})`, timeVisible: true, secondsVisible: false },
        crosshair: { mode: 1 },
      });

      const bull = styles.getPropertyValue("--bull").trim();
      const bear = styles.getPropertyValue("--bear").trim();
      const series = chart.addSeries(lib.CandlestickSeries, {
        upColor: `oklch(${bull})`,
        downColor: `oklch(${bear})`,
        borderUpColor: `oklch(${bull})`,
        borderDownColor: `oklch(${bear})`,
        wickUpColor: `oklch(${bull})`,
        wickDownColor: `oklch(${bear})`,
      });
      series.setData(data as any);

      for (const l of lines) {
        series.createPriceLine({
          price: l.price,
          color: l.color,
          lineWidth: 1,
          lineStyle: l.style === "dashed" ? 2 : 0,
          axisLabelVisible: true,
          title: l.label,
        });
      }

      chart.timeScale().fitContent();

      resizeObserver = new ResizeObserver((entries) => {
        for (const e of entries) chart.applyOptions({ width: e.contentRect.width });
      });
      resizeObserver.observe(containerRef.current);
    })();

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      chart?.remove();
    };
  }, [data, lines, height]);

  return <div ref={containerRef} className="w-full" style={{ height }} />;
}

export function EquityChart({
  data,
  height = 200,
}: {
  data: Array<{ time: number; value: number }>;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let disposed = false;
    let chart: any;
    let ro: ResizeObserver | undefined;
    (async () => {
      const lib = await import("lightweight-charts");
      if (disposed || !containerRef.current) return;
      const s = getComputedStyle(document.documentElement);
      const text = s.getPropertyValue("--foreground").trim();
      const grid = s.getPropertyValue("--grid").trim();
      const bg = s.getPropertyValue("--card").trim();
      const info = s.getPropertyValue("--info").trim();

      chart = lib.createChart(containerRef.current, {
        height,
        layout: {
          background: { type: lib.ColorType.Solid, color: `oklch(${bg})` },
          textColor: `oklch(${text})`,
          fontFamily: "JetBrains Mono, ui-monospace, monospace",
          fontSize: 10,
        },
        grid: {
          vertLines: { color: `oklch(${grid})` },
          horzLines: { color: `oklch(${grid})` },
        },
        rightPriceScale: { borderColor: `oklch(${grid})` },
        timeScale: { borderColor: `oklch(${grid})`, timeVisible: false },
      });
      const series = chart.addSeries(lib.AreaSeries, {
        lineColor: `oklch(${info})`,
        topColor: `oklch(${info} / 0.4)`,
        bottomColor: `oklch(${info} / 0)`,
        lineWidth: 2,
      });
      series.setData(data as any);
      chart.timeScale().fitContent();
      ro = new ResizeObserver((es) => {
        for (const e of es) chart.applyOptions({ width: e.contentRect.width });
      });
      ro.observe(containerRef.current);
    })();
    return () => {
      disposed = true;
      ro?.disconnect();
      chart?.remove();
    };
  }, [data, height]);

  return <div ref={containerRef} className="w-full" style={{ height }} />;
}
