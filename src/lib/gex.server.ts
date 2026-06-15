// Server-only Tradier options helpers + dealer-gamma computation.
// Read TRADIER_ACCESS_TOKEN inside the calling handler, not here.

const BASE = "https://api.tradier.com";

interface TradierOption {
  symbol: string;
  strike: number;
  option_type: "call" | "put";
  open_interest?: number;
  volume?: number;
  greeks?: {
    gamma?: number;
    delta?: number;
  } | null;
  expiration_date?: string;
}

async function tradierGet(
  token: string,
  path: string,
  params: Record<string, string>,
): Promise<unknown> {
  const url = new URL(path, BASE);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) {
    console.error(
      `[tradier] ${path} ${res.status}: ${await res.text().catch(() => "")}`,
    );
    return null;
  }
  return res.json();
}

export async function fetchSpxExpirations(token: string): Promise<string[]> {
  const json = (await tradierGet(token, "/v1/markets/options/expirations", {
    symbol: "SPX",
    includeAllRoots: "true",
    strikes: "false",
  })) as { expirations?: { date?: string | string[] } } | null;
  const raw = json?.expirations?.date;
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

export async function fetchSpxSpot(token: string): Promise<number | null> {
  const json = (await tradierGet(token, "/v1/markets/quotes", {
    symbols: "SPX",
  })) as { quotes?: { quote?: { last?: number } | { last?: number }[] } } | null;
  const q = json?.quotes?.quote;
  const one = Array.isArray(q) ? q[0] : q;
  return one?.last ?? null;
}

export async function fetchSpxChain(
  token: string,
  expiration: string,
): Promise<TradierOption[]> {
  const json = (await tradierGet(token, "/v1/markets/options/chains", {
    symbol: "SPX",
    expiration,
    greeks: "true",
  })) as { options?: { option?: TradierOption | TradierOption[] } } | null;
  const raw = json?.options?.option;
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

export interface GexLevel {
  label: string;
  price: number;
  weight: number;
}

interface StrikeAgg {
  strike: number;
  callGex: number; // $ per 1% move
  putGex: number; // signed negative
  netGex: number;
}

export function computeGex(opts: TradierOption[], spot: number): GexLevel[] {
  if (!opts.length || !spot) return [];
  const byStrike = new Map<number, StrikeAgg>();
  // Dollar-gamma per 1% spot move: gamma * OI * 100 (contract mult) * spot^2 * 0.01
  const scale = spot * spot * 100 * 0.01;

  for (const o of opts) {
    const g = o.greeks?.gamma;
    const oi = o.open_interest;
    if (g == null || !Number.isFinite(g) || !oi) continue;
    const dollar = g * oi * scale;
    let a = byStrike.get(o.strike);
    if (!a) {
      a = { strike: o.strike, callGex: 0, putGex: 0, netGex: 0 };
      byStrike.set(o.strike, a);
    }
    if (o.option_type === "call") {
      a.callGex += dollar;
      a.netGex += dollar;
    } else {
      // Dealers are typically short puts → negative gamma contribution.
      a.putGex -= dollar;
      a.netGex -= dollar;
    }
  }

  const strikes = [...byStrike.values()].sort((x, y) => x.strike - y.strike);
  if (!strikes.length) return [];

  // Call Wall: largest positive call GEX above spot.
  let callWall: StrikeAgg | null = null;
  for (const s of strikes) {
    if (s.strike <= spot) continue;
    if (!callWall || s.callGex > callWall.callGex) callWall = s;
  }
  // Put Wall: largest abs put GEX below spot.
  let putWall: StrikeAgg | null = null;
  for (const s of strikes) {
    if (s.strike >= spot) continue;
    if (!putWall || s.putGex < putWall.putGex) putWall = s;
  }
  // Gamma Flip: where cumulative net GEX crosses zero.
  let flip: number | null = null;
  let cum = 0;
  let prevStrike = strikes[0].strike;
  let prevCum = 0;
  for (const s of strikes) {
    const next = cum + s.netGex;
    if ((cum <= 0 && next > 0) || (cum >= 0 && next < 0)) {
      // linear interp between prevStrike and s.strike on prevCum→next
      const span = next - prevCum;
      if (span !== 0) {
        const t = -prevCum / span;
        flip = prevStrike + (s.strike - prevStrike) * t;
      } else {
        flip = s.strike;
      }
      break;
    }
    prevCum = next;
    prevStrike = s.strike;
    cum = next;
  }

  // HVL — highest absolute |netGex| strike overall.
  let hvl: StrikeAgg | null = null;
  for (const s of strikes) {
    if (!hvl || Math.abs(s.netGex) > Math.abs(hvl.netGex)) hvl = s;
  }

  const out: GexLevel[] = [];
  if (callWall) out.push({ label: "Call Wall", price: callWall.strike, weight: 1 });
  if (putWall) out.push({ label: "Put Wall", price: putWall.strike, weight: 0.9 });
  if (flip != null) out.push({ label: "Gamma Flip", price: Math.round(flip), weight: 0.7 });
  if (hvl && (!callWall || hvl.strike !== callWall.strike) && (!putWall || hvl.strike !== putWall.strike)) {
    out.push({ label: "HVL", price: hvl.strike, weight: 0.5 });
  }
  return out;
}
