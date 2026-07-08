import { useMemo } from "react";
import { useEsFeed } from "./use-es-feed";
import { getPriorRthProfile, type PriorRthProfile } from "./profile-levels";

export function useTpoProfile(symbol: string): {
  profile: PriorRthProfile | null;
  source: "schwab" | "mock";
} {
  const { base1m, source } = useEsFeed("2m", symbol);
  const profile = useMemo(() => getPriorRthProfile(base1m), [base1m]);
  return { profile, source };
}
