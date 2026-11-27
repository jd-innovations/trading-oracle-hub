// GEX calculation engine (Phase 0a research version, TypeScript).
// Method follows the GEX Platform Build Spec v0.2:
//  - Gamma is recomputed from each contract's implied volatility (Black-Scholes-Merton
//    with dividend yield), not taken from the broker.
//  - Per-strike exposure in $ per 1% move: s * gamma * OI * multiplier * S^2 * 0.01,
//    s = +1 calls, -1 puts (a modeling convention, not observed dealer inventory).
//  - Gamma flips are found by re-pricing the whole chain across a grid of hypothetical
//    spot prices (sticky-strike IV). Every zero crossing is kept; the primary flip (HVL)
//    is the one nearest spot. Regime = sign of net GEX at the current spot.
//  - Missing open interest is never interpolated. Bad quotes are dropped and counted.
// When the production engine is built (Python), this file is the reference to check it against.

export const GEX_METHOD_VERSION = "ts-0.2.0";

export type ExpirySet = "0dte" | "sigma4" | "monthly";

export interface RawOption {
  strike: number;
  type: "call" | "put";
  openInterest: number | null | undefined;
  /** Implied volatility as a decimal (0.18 = 18%). */
  iv: number | null | undefined;
  bid?: number | null;
  ask?: number | null;
  /** YYYY-MM-DD expiration date. */
  expiration: string;
  /** "AM" for AM-settled (e.g. SPX monthlies), "PM" otherwise. */
  settlement?: "AM" | "PM";
  /** True if this is the standard monthly expiration. */
  monthly?: boolean;
}

export type GexLevelKind = "hvl" | "flip" | "callWall" | "putWall" | "call" | "put";

export interface GexLevel {
  label: string;
  price: number;
  weight: number;
  kind?: GexLevelKind;
  /** Exposure at the strike, $ per 1% move (signed). Not set for flips. */
  gex?: number;
}

export interface GexQuality {
  status: "ok" | "degraded" | "unusable";
  contractsUsed: number;
  contractsTotal: number;
  /** Share of open interest dropped by the quality rules (0..1). */
  droppedOiShare: number;
}

export interface GexComputation {
  levels: GexLevel[];
  regime: "positive" | "negative" | null;
  netGex: number; // $ per 1% move at current spot
  flips: number[]; // all zero crossings in the sweep range, sorted by distance to spot
  primaryFlip: number | null;
  expirations: string[];
  quality: GexQuality;
  method: string;
}

export interface GexParams {
  spot: number;
  /** Unix ms "now" — passed in so results are reproducible. */
  now: number;
  multiplier?: number; // 100 for SPX/SPY/QQQ options
  rate?: number; // risk-free rate, decimal
  divYield?: number; // dividend yield, decimal
}

const SQRT_2PI = Math.sqrt(2 * Math.PI);
const npdf = (x: number) => Math.exp(-0.5 * x * x) / SQRT_2PI;
const YEAR_MS = 365 * 24 * 3600 * 1000;

/** Exact expiration time in UTC ms: 9:30 ET for AM-settled, 16:00 ET for PM-settled. */
export function expirationTimestamp(date: string, settlement: "AM" | "PM" = "PM"): number {
  const [y, m, d] = date.split("-").map(Number);
  // Find the ET offset on that date (handles DST) by formatting noon UTC in New York.
  const noonUtc = Date.UTC(y, m - 1, d, 12);
  const etHour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "2-digit",
      hour12: false,
    })
      .format(new Date(noonUtc))
      .replace(/\D/g, ""),
  );
  const offsetH = 12 - etHour; // 4 in EDT, 5 in EST
  const hour = settlement === "AM" ? 9.5 : 16;
  return Date.UTC(y, m - 1, d) + (hour + offsetH) * 3600 * 1000;
}

/** Today's date in New York as YYYY-MM-DD. */
export function todayET(now: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(now));
}

export function isThirdFriday(date: string): boolean {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCDay() === 5 && d >= 15 && d <= 21;
}

function bsmGamma(S: number, K: number, T: number, sigma: number, r: number, q: number): number {
  if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) return 0;
  const sq = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * sq);
  return (Math.exp(-q * T) * npdf(d1)) / (S * sigma * sq);
}

/** Pick the expirations that belong to an expiry set (spec v0.2 definitions). */
export function selectExpirations(
  all: string[],
  set: ExpirySet,
  now: number,
  monthlyDates?: Set<string>,
): string[] {
  const today = todayET(now);
  const future = [...new Set(all)].filter((d) => d >= today).sort();
  if (!future.length) return [];
  if (set === "0dte") {
    // Contracts expiring today; if none today (holiday/weekend), the nearest expiration.
    return future[0] === today ? [today] : [future[0]];
  }
  if (set === "sigma4") {
    // Next 4 expirations after today, today excluded.
    return future.filter((d) => d > today).slice(0, 4);
  }
  const monthly = future.find((d) => (monthlyDates ? monthlyDates.has(d) : isThirdFriday(d)));
  return monthly ? [monthly] : [];
}

interface Prepared {
  K: number;
  sign: 1 | -1;
  oi: number;
  sigma: number;
  T: number;
}

export function computeGexLevels(
  rawAll: RawOption[],
  expirySet: ExpirySet,
  p: GexParams,
): GexComputation | null {
  const { spot, now } = p;
  const M = p.multiplier ?? 100;
  const r = p.rate ?? 0.04;
  const q = p.divYield ?? 0.013;
  if (!spot || !Number.isFinite(spot) || !rawAll.length) return null;

  const monthlyDates = new Set(rawAll.filter((o) => o.monthly).map((o) => o.expiration));
  const exps = selectExpirations(
    rawAll.map((o) => o.expiration),
    expirySet,
    now,
    monthlyDates.size ? monthlyDates : undefined,
  );
  if (!exps.length) return null;
  const keep = new Set(exps);
  const raw = rawAll.filter((o) => keep.has(o.expiration));

  // ---- quality rules
  let totalOi = 0;
  let droppedOi = 0;
  const prepared: Prepared[] = [];
  for (const o of raw) {
    const oi = o.openInterest ?? 0;
    if (!(oi > 0)) continue; // no OI = no exposure; never interpolated
    totalOi += oi;
    const T = (expirationTimestamp(o.expiration, o.settlement ?? "PM") - now) / YEAR_MS;
    const crossed = o.bid != null && o.ask != null && o.ask > 0 && o.bid > o.ask;
    if (crossed || T <= 0) {
      droppedOi += oi;
      continue;
    }
    const sigma = o.iv ?? NaN;
    if (!(sigma >= 0.01 && sigma <= 3)) {
      droppedOi += oi; // invalid IV: dropped, never guessed
      continue;
    }
    prepared.push({
      K: o.strike,
      sign: o.type === "call" ? 1 : -1,
      oi,
      sigma,
      T: Math.max(T, 1 / (365 * 24 * 60)),
    });
  }
  const droppedShare = totalOi ? droppedOi / totalOi : 1;
  const quality: GexQuality = {
    status:
      !prepared.length || droppedShare > 0.25 ? "unusable" : droppedShare > 0.1 ? "degraded" : "ok",
    contractsUsed: prepared.length,
    contractsTotal: raw.length,
    droppedOiShare: droppedShare,
  };
  if (quality.status === "unusable") {
    return {
      levels: [],
      regime: null,
      netGex: 0,
      flips: [],
      primaryFlip: null,
      expirations: exps,
      quality,
      method: GEX_METHOD_VERSION,
    };
  }

  const gammaAt = (c: Prepared, S: number) => bsmGamma(S, c.K, c.T, c.sigma, r, q);
  const netAt = (S: number) => {
    let n = 0;
    const sc = M * S * S * 0.01;
    for (const c of prepared) n += c.sign * gammaAt(c, S) * c.oi * sc;
    return n;
  };

  // ---- per-strike exposure at current spot
  const byStrike = new Map<number, { call: number; put: number }>();
  const sc = M * spot * spot * 0.01;
  for (const c of prepared) {
    const g = gammaAt(c, spot) * c.oi * sc;
    const a = byStrike.get(c.K) ?? { call: 0, put: 0 };
    if (c.sign === 1) a.call += g;
    else a.put -= g;
    byStrike.set(c.K, a);
  }
  const strikes = [...byStrike.entries()].map(([K, a]) => ({ K, call: a.call, put: a.put }));
  const netGex = netAt(spot);

  // ---- gamma flips via spot sweep (sticky-strike IV)
  const atm = prepared.reduce(
    (b, c) => (Math.abs(c.K - spot) < Math.abs(b.K - spot) ? c : b),
    prepared[0],
  );
  const maxT = Math.max(...prepared.map((c) => c.T));
  const em = spot * atm.sigma * Math.sqrt(maxT);
  const half = Math.min(spot * 0.1, Math.max(spot * 0.01, 3 * em));
  const N = 160;
  const grid: { S: number; n: number }[] = [];
  for (let i = 0; i <= N; i++) {
    const S = spot - half + (2 * half * i) / N;
    grid.push({ S, n: netAt(S) });
  }
  const flips: number[] = [];
  for (let i = 1; i < grid.length; i++) {
    const a = grid[i - 1];
    const b = grid[i];
    if (a.n === 0) flips.push(a.S);
    else if ((a.n < 0 && b.n > 0) || (a.n > 0 && b.n < 0))
      flips.push(a.S + ((b.S - a.S) * -a.n) / (b.n - a.n));
  }
  flips.sort((x, y) => Math.abs(x - spot) - Math.abs(y - spot));
  const primaryFlip = flips.length ? flips[0] : null;

  // ---- walls: largest call GEX / most negative put GEX; ties -> nearest spot, then higher strike exposure
  const byNear = (a: { K: number }, b: { K: number }) =>
    Math.abs(a.K - spot) - Math.abs(b.K - spot);
  const calls = strikes.filter((s) => s.call > 0).sort((a, b) => b.call - a.call || byNear(a, b));
  const puts = strikes.filter((s) => s.put < 0).sort((a, b) => a.put - b.put || byNear(a, b));
  const maxAbs = Math.max(calls[0]?.call ?? 0, -(puts[0]?.put ?? 0), 1);

  const levels: GexLevel[] = [];
  if (primaryFlip != null)
    levels.push({ label: "HVL", price: round(primaryFlip), weight: 0.9, kind: "hvl" });
  flips
    .slice(1, 3)
    .forEach((f, i) =>
      levels.push({ label: `Flip ${i + 2}`, price: round(f), weight: 0.4, kind: "flip" }),
    );
  if (calls[0])
    levels.push({
      label: "Call Wall",
      price: calls[0].K,
      weight: 1,
      kind: "callWall",
      gex: calls[0].call,
    });
  if (puts[0])
    levels.push({
      label: "Put Wall",
      price: puts[0].K,
      weight: 1,
      kind: "putWall",
      gex: puts[0].put,
    });
  calls
    .slice(1, 3)
    .forEach((s, i) =>
      levels.push({
        label: `C${i + 2}`,
        price: s.K,
        weight: s.call / maxAbs,
        kind: "call",
        gex: s.call,
      }),
    );
  puts
    .slice(1, 3)
    .forEach((s, i) =>
      levels.push({
        label: `P${i + 2}`,
        price: s.K,
        weight: -s.put / maxAbs,
        kind: "put",
        gex: s.put,
      }),
    );

  return {
    levels,
    regime: netGex > 0 ? "positive" : netGex < 0 ? "negative" : null,
    netGex,
    flips: flips.map(round),
    primaryFlip: primaryFlip == null ? null : round(primaryFlip),
    expirations: exps,
    quality,
    method: GEX_METHOD_VERSION,
  };
}

const round = (x: number) => Math.round(x * 100) / 100;
