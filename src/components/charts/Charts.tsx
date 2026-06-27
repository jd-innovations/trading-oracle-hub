import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

export interface ChartHandle {
  fitContent: () => void;
}
import { toRgb, withAlpha } from "@/lib/color";
import { OpeningRangePrimitive } from "./OpeningRangePrimitive";
import type { OpeningRangeZone } from "@/lib/opening-ranges";
import { ProfileLevelsPrimitive } from "./ProfileLevelsPrimitive";
import type { ProfileLevel } from "@/lib/profile-levels";

export interface PriceLine {
  price: number;
  color: string;
  label: string;
  style?: "solid" | "dashed";
}

function useThemeKey() {
  const [key, setKey] = useState(0);
  useEffect(() => {
    if (typeof MutationObserver === "undefined") return;
    const mo = new MutationObserver(() => setKey((k) => k + 1));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);
  return key;
}

export const EsCandleChart = forwardRef<ChartHandle, {
  data: Array<{ time: number; open: number; high: number; low: number; close: number }>;
  lines?: PriceLine[];
  zones?: OpeningRangeZone[];
  profileLevels?: ProfileLevel[];
  height?: number;
}>(function EsCandleChart(
  { data, lines = [], zones = [], profileLevels = [], height = 320 },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const primitiveRef = useRef<OpeningRangePrimitive | null>(null);
  const profileRef = useRef<ProfileLevelsPrimitive | null>(null);
  const zonesRef = useRef<OpeningRangeZone[]>(zones);
  const levelsRef = useRef<ProfileLevel[]>(profileLevels);
  const themeKey = useThemeKey();

  useImperativeHandle(ref, () => ({
    fitContent: () => {
      chartRef.current?.timeScale().fitContent();
    },
  }), []);

  useEffect(() => {
    let disposed = false;
    let chart: any;
    let resizeObserver: ResizeObserver | undefined;

    (async () => {
      const lib = await import("lightweight-charts");
      if (disposed || !containerRef.current) return;
      const styles = getComputedStyle(document.documentElement);
      const text = toRgb(styles.getPropertyValue("--foreground"), "rgb(221,221,221)");
      const grid = toRgb(styles.getPropertyValue("--grid"), "rgb(51,51,51)");
      const bg = toRgb(styles.getPropertyValue("--card"), "rgb(17,17,17)");
      const bull = toRgb(styles.getPropertyValue("--bull"), "rgb(34,197,94)");
      const bear = toRgb(styles.getPropertyValue("--bear"), "rgb(239,68,68)");

      const etTimeFmt = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
      });
      const etDateTimeFmt = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        hour12: false,
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
      const fmtET = (time: number) => etTimeFmt.format(new Date(time * 1000));
      const fmtETDateTime = (time: number) =>
        etDateTimeFmt.format(new Date(time * 1000)) + " ET";

      chart = lib.createChart(containerRef.current, {
        width: containerRef.current.clientWidth,
        height,
        localization: {
          locale: "en-US",
          timeFormatter: fmtETDateTime,
        },
        layout: {
          background: { type: lib.ColorType.Solid, color: bg },
          textColor: text,
          fontFamily: "JetBrains Mono, ui-monospace, Menlo, monospace",
          fontSize: 11,
        },
        grid: {
          vertLines: { color: grid },
          horzLines: { color: grid },
        },
        rightPriceScale: { borderColor: grid },
        timeScale: {
          borderColor: grid,
          timeVisible: true,
          secondsVisible: false,
          rightOffset: 4,
          barSpacing: 8,
          minBarSpacing: 6,
          tickMarkFormatter: (time: number) => fmtET(time),
        },
        crosshair: { mode: 1 },
      });
      chartRef.current = chart;

      const series = chart.addSeries(lib.CandlestickSeries, {
        upColor: bull,
        downColor: bear,
        borderUpColor: bull,
        borderDownColor: bear,
        wickUpColor: bull,
        wickDownColor: bear,
      });
      series.setData(data as any);

      for (const l of lines) {
        series.createPriceLine({
          price: l.price,
          color: toRgb(l.color, l.color),
          lineWidth: 1,
          lineStyle: l.style === "dashed" ? 2 : 0,
          axisLabelVisible: true,
          title: l.label,
        });
      }

      const primitive = new OpeningRangePrimitive();
      series.attachPrimitive(primitive);
      primitive.setZones(zonesRef.current);
      primitiveRef.current = primitive;

      const profile = new ProfileLevelsPrimitive();
      series.attachPrimitive(profile);
      profile.setLevels(levelsRef.current);
      profileRef.current = profile;

      chart.timeScale().fitContent();

      resizeObserver = new ResizeObserver((entries) => {
        for (const e of entries) chart.applyOptions({ width: e.contentRect.width });
      });
      resizeObserver.observe(containerRef.current);
    })();

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      primitiveRef.current = null;
      profileRef.current = null;
      chartRef.current = null;
      chart?.remove();
    };
  }, [data, lines, height, themeKey]);

  // Push zones into the primitive without recreating the chart.
  useEffect(() => {
    zonesRef.current = zones;
    primitiveRef.current?.setZones(zones);
  }, [zones]);

  useEffect(() => {
    levelsRef.current = profileLevels;
    profileRef.current?.setLevels(profileLevels);
  }, [profileLevels]);

  return <div ref={containerRef} className="w-full" style={{ height }} />;
});

export function EquityChart({
  data,
  height = 200,
}: {
  data: Array<{ time: number; value: number }>;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const themeKey = useThemeKey();

  useEffect(() => {
    let disposed = false;
    let chart: any;
    let ro: ResizeObserver | undefined;
    (async () => {
      const lib = await import("lightweight-charts");
      if (disposed || !containerRef.current) return;
      const s = getComputedStyle(document.documentElement);
      const text = toRgb(s.getPropertyValue("--foreground"), "rgb(221,221,221)");
      const grid = toRgb(s.getPropertyValue("--grid"), "rgb(51,51,51)");
      const bg = toRgb(s.getPropertyValue("--card"), "rgb(17,17,17)");
      const info = toRgb(s.getPropertyValue("--info"), "rgb(56,189,248)");

      chart = lib.createChart(containerRef.current, {
        height,
        localization: { locale: "en-US" },
        layout: {
          background: { type: lib.ColorType.Solid, color: bg },
          textColor: text,
          fontFamily: "JetBrains Mono, ui-monospace, monospace",
          fontSize: 10,
        },
        grid: {
          vertLines: { color: grid },
          horzLines: { color: grid },
        },
        rightPriceScale: { borderColor: grid },
        timeScale: { borderColor: grid, timeVisible: false },
      });
      const series = chart.addSeries(lib.AreaSeries, {
        lineColor: info,
        topColor: withAlpha(info, 0.4),
        bottomColor: withAlpha(info, 0),
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
  }, [data, height, themeKey]);

  return <div ref={containerRef} className="w-full" style={{ height }} />;
}
