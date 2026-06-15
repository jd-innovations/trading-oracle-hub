import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getSpxGex, type GexResult } from "./gex.functions";

const REFRESH_MS = 60_000;

/**
 * Poll SPX dealer-gamma levels from Tradier every minute. When `enabled`
 * is false, no requests are made. Returns empty levels on any failure so
 * the chart can silently fall back to the mock GEX list.
 */
export function useSpxGex(enabled: boolean) {
  const fetchGex = useServerFn(getSpxGex);
  const [state, setState] = useState<GexResult>({
    levels: [],
    asOf: 0,
    spot: null,
  });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const tick = () => {
      fetchGex({ data: { expirations: 1 } })
        .then((res) => {
          if (!cancelled) setState(res);
        })
        .catch(() => {
          /* silent — keep last known state */
        });
    };
    tick();
    const id = setInterval(tick, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [enabled, fetchGex]);

  return {
    levels: state.levels,
    asOf: state.asOf,
    isLive: state.levels.length > 0,
  };
}
