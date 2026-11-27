import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getGex, type GexResult } from "./gex.functions";
import type { ExpirySet } from "./gex-engine";

const REFRESH_MS = 60_000;

export type { GexResult };

/**
 * Poll GEX levels for an underlying every minute while enabled.
 * Keeps the last good result on a failed refresh (its asOf shows how old it is);
 * never substitutes mock levels.
 */
export function useGex(underlying: "SPX" | "QQQ", expirySet: ExpirySet, enabled: boolean) {
  const fetchGex = useServerFn(getGex);
  const [result, setResult] = useState<GexResult | null>(null);
  const [lastError, setLastError] = useState<GexResult["error"] | "request_failed" | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setResult(null);
    setLastError(null);
  }, [underlying, expirySet]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const tick = async () => {
      setLoading(true);
      try {
        const r = await fetchGex({ data: { underlying, expirySet } });
        if (cancelled) return;
        if (r.levels.length) {
          setResult(r);
          setLastError(null);
        } else {
          setLastError(r.error ?? "empty");
          // keep the previous good result, if any, so the user sees it go stale rather than vanish
          setResult((prev) => prev ?? r);
        }
      } catch {
        if (!cancelled) setLastError("request_failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    tick();
    const id = setInterval(tick, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [enabled, underlying, expirySet, fetchGex]);

  return { result, lastError, loading };
}
