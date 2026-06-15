import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_OPENING_RANGES,
  type OpeningRangeConfig,
} from "./opening-ranges";

const STORAGE_KEY = "chart.openingRanges.v1";

function load(): OpeningRangeConfig[] {
  if (typeof window === "undefined") return DEFAULT_OPENING_RANGES();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_OPENING_RANGES();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.length) return DEFAULT_OPENING_RANGES();
    return parsed as OpeningRangeConfig[];
  } catch {
    return DEFAULT_OPENING_RANGES();
  }
}

export function useOpeningRanges() {
  const [configs, setConfigs] = useState<OpeningRangeConfig[]>(() => DEFAULT_OPENING_RANGES());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setConfigs(load());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(configs));
    } catch {
      // ignore quota / private-mode errors
    }
  }, [configs, hydrated]);

  const reset = useCallback(() => setConfigs(DEFAULT_OPENING_RANGES()), []);

  return { configs, setConfigs, reset };
}
