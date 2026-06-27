import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getSpxGex, type GexResult } from "./gex.functions";
import { getSchwabSpxGex } from "./schwab.functions";
import { supabase } from "@/integrations/supabase/client";

const REFRESH_MS = 60_000;

export type GexSource = "schwab" | "tradier" | "mock";

/**
 * Poll SPX dealer-gamma levels. Tries Schwab when signed in, falls back
 * to Tradier, then to empty (chart shows mock).
 */
export function useSpxGex(enabled: boolean) {
  const fetchTradier = useServerFn(getSpxGex);
  const fetchSchwab = useServerFn(getSchwabSpxGex);
  const [state, setState] = useState<GexResult>({
    levels: [],
    asOf: 0,
    spot: null,
  });
  const [source, setSource] = useState<GexSource>("mock");

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const tick = async () => {
      const { data: s } = await supabase.auth.getSession();
      if (s.session) {
        try {
          const r = await fetchSchwab({ data: { expirations: 1 } });
          if (!cancelled && r.levels.length) {
            setState(r);
            setSource("schwab");
            return;
          }
        } catch {
          /* fall through */
        }
      }
      try {
        const r = await fetchTradier({ data: { expirations: 1 } });
        if (!cancelled) {
          setState(r);
          setSource(r.levels.length ? "tradier" : "mock");
        }
      } catch {
        /* keep last */
      }
    };
    tick();
    const id = setInterval(tick, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [enabled, fetchSchwab, fetchTradier]);

  return {
    levels: state.levels,
    asOf: state.asOf,
    spot: state.spot,
    isLive: state.levels.length > 0,
    source,
  };
}
