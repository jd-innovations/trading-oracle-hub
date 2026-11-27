// Server-only option-chain adapters for the GEX engine.
// Each adapter turns a broker chain into the engine's normalized RawOption[].
// Env/token reads happen in the calling handler, not here.
import { selectExpirations, type ExpirySet, type RawOption } from "./gex-engine";

export type GexUnderlying = "SPX" | "QQQ";

export interface NormalizedChain {
  spot: number | null;
  options: RawOption[];
}

/** Calendar window to request for an expiry set (keeps chain payloads small). */
export function windowDays(set: ExpirySet): number {
  return set === "0dte" ? 7 : set === "sigma4" ? 12 : 45;
}

// ---------------- Tradier ----------------

const TRADIER = "https://api.tradier.com";

interface TradierOption {
  strike: number;
  option_type: "call" | "put";
  open_interest?: number;
  bid?: number | null;
  ask?: number | null;
  root_symbol?: string;
  expiration_type?: string;
  expiration_date?: string;
  greeks?: { mid_iv?: number; smv_vol?: number } | null;
}

async function tradierGet(
  token: string,
  path: string,
  params: Record<string, string>,
): Promise<unknown> {
  const url = new URL(path, TRADIER);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) {
    console.error(`[tradier] ${path} ${res.status}: ${await res.text().catch(() => "")}`);
    return null;
  }
  return res.json();
}

export async function fetchTradierChain(
  token: string,
  underlying: GexUnderlying,
  set: ExpirySet,
  now: number,
): Promise<NormalizedChain> {
  const [expJson, quoteJson] = await Promise.all([
    tradierGet(token, "/v1/markets/options/expirations", {
      symbol: underlying,
      includeAllRoots: "true",
      strikes: "false",
    }) as Promise<{ expirations?: { date?: string | string[] } } | null>,
    tradierGet(token, "/v1/markets/quotes", { symbols: underlying }) as Promise<{
      quotes?: { quote?: { last?: number } | { last?: number }[] };
    } | null>,
  ]);
  const rawExp = expJson?.expirations?.date;
  const allExp = rawExp ? (Array.isArray(rawExp) ? rawExp : [rawExp]) : [];
  const q = quoteJson?.quotes?.quote;
  const spot = (Array.isArray(q) ? q[0] : q)?.last ?? null;
  const pick = selectExpirations(allExp, set, now);
  const chains = await Promise.all(
    pick.map(
      (expiration) =>
        tradierGet(token, "/v1/markets/options/chains", {
          symbol: underlying,
          expiration,
          greeks: "true",
        }) as Promise<{
          options?: { option?: TradierOption | TradierOption[] };
        } | null>,
    ),
  );
  const options: RawOption[] = [];
  for (const c of chains) {
    const raw = c?.options?.option;
    const list = raw ? (Array.isArray(raw) ? raw : [raw]) : [];
    for (const o of list) {
      if (!o.expiration_date) continue;
      const amRoot = underlying === "SPX" && (o.root_symbol ?? "SPX") === "SPX";
      options.push({
        strike: o.strike,
        type: o.option_type,
        openInterest: o.open_interest ?? null,
        iv: o.greeks?.mid_iv ?? o.greeks?.smv_vol ?? null,
        bid: o.bid ?? null,
        ask: o.ask ?? null,
        expiration: o.expiration_date,
        settlement: amRoot ? "AM" : "PM",
        monthly: o.expiration_type === "standard",
      });
    }
  }
  return { spot, options };
}

// ---------------- Schwab ----------------

interface SchwabContract {
  symbol: string;
  strikePrice: number;
  openInterest?: number;
  volatility?: number; // percent, -999 when unavailable
  bid?: number;
  ask?: number;
  expirationDate?: string;
  settlementType?: string; // "A" (AM) | "P" (PM)
  expirationType?: string; // "S" standard monthly, "W" weekly, ...
}

type SchwabExpMap = Record<string, Record<string, SchwabContract[]>>;

interface SchwabChainResponse {
  underlyingPrice?: number;
  underlying?: { last?: number; mark?: number };
  callExpDateMap?: SchwabExpMap;
  putExpDateMap?: SchwabExpMap;
}

export async function fetchSchwabNormalizedChain(opts: {
  token: string;
  underlying: GexUnderlying;
  set: ExpirySet;
  now: number;
  get: (token: string, path: string, params: Record<string, string>) => Promise<unknown>;
}): Promise<NormalizedChain> {
  const from = new Date(opts.now).toISOString().slice(0, 10);
  const to = new Date(opts.now + windowDays(opts.set) * 86400000).toISOString().slice(0, 10);
  const json = (await opts.get(opts.token, "/marketdata/v1/chains", {
    symbol: opts.underlying === "SPX" ? "$SPX" : "QQQ",
    contractType: "ALL",
    includeUnderlyingQuote: "true",
    strategy: "SINGLE",
    strikeCount: "120",
    fromDate: from,
    toDate: to,
  })) as SchwabChainResponse | null;
  if (!json) return { spot: null, options: [] };
  const options: RawOption[] = [];
  const flatten = (map: SchwabExpMap | undefined, type: "call" | "put") => {
    if (!map) return;
    for (const expKey of Object.keys(map)) {
      const expiration = expKey.split(":")[0];
      for (const strike of Object.keys(map[expKey])) {
        for (const c of map[expKey][strike]) {
          const root = c.symbol.trim().split(/\s+/)[0];
          const am = c.settlementType
            ? c.settlementType.toUpperCase() === "A"
            : opts.underlying === "SPX" && root === "SPX";
          const vol = c.volatility;
          options.push({
            strike: c.strikePrice,
            type,
            openInterest: c.openInterest ?? null,
            iv: vol != null && vol > 0 ? vol / 100 : null,
            bid: c.bid ?? null,
            ask: c.ask ?? null,
            expiration,
            settlement: am ? "AM" : "PM",
            monthly: c.expirationType ? c.expirationType.toUpperCase() === "S" : undefined,
          });
        }
      }
    }
  };
  flatten(json.callExpDateMap, "call");
  flatten(json.putExpDateMap, "put");
  const spot = json.underlyingPrice ?? json.underlying?.last ?? json.underlying?.mark ?? null;
  return { spot, options };
}
