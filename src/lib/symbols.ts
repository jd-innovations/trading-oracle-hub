// Central registry of tradable futures symbols supported by the planner.
// Add a new symbol here and it becomes selectable in the UI, plan generator,
// and chart panel without touching downstream logic.

export type SymbolId = "ES" | "NQ";

export interface SymbolConfig {
  id: SymbolId;
  /** Schwab root passed to the price-history endpoint (e.g. "/ES"). */
  schwabRoot: string;
  /** Display label. */
  label: string;
  /** Tick size in points (0.25 for ES and NQ). */
  tickSize: number;
  /** Minimum spacing between pivot & sequential targets (points). */
  minGap: number;
}

export const SYMBOLS: Record<SymbolId, SymbolConfig> = {
  ES: { id: "ES", schwabRoot: "/ES", label: "ES", tickSize: 0.25, minGap: 8 },
  NQ: { id: "NQ", schwabRoot: "/NQ", label: "NQ", tickSize: 0.25, minGap: 80 },
};

export const SUPPORTED_SYMBOLS: SymbolConfig[] = [SYMBOLS.ES, SYMBOLS.NQ];

export function getSymbol(id: string): SymbolConfig {
  const key = (id.startsWith("/") ? id.slice(1) : id).toUpperCase() as SymbolId;
  return SYMBOLS[key] ?? SYMBOLS.ES;
}
