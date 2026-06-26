// Server-only Schwab API helpers. All env reads happen inside functions
// (per-request injection on the Worker). Token refresh + persistence go
// through Supabase admin client, loaded lazily inside handlers.
import type { Candle } from "./chart-utils";

const BASE = "https://api.schwabapi.com";
const TOKEN_URL = `${BASE}/v1/oauth/token`;

const ACCESS_TTL_SEC = 30 * 60; // Schwab access tokens last 30m
const REFRESH_TTL_SEC = 7 * 24 * 3600; // Schwab refresh tokens last 7d

export class SchwabReauthRequired extends Error {
  constructor() {
    super("Schwab reauth required");
    this.name = "SchwabReauthRequired";
  }
}

// ---------- OAuth token exchange ----------

interface SchwabTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number; // seconds
  token_type: string;
  scope?: string;
}

export interface ProvidedSchwabTokens {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  accessExpiresAt?: string;
  refreshExpiresAt?: string;
}

function basicAuth(): string {
  const key = process.env.SCHWAB_APP_KEY;
  const secret = process.env.SCHWAB_APP_SECRET;
  if (!key || !secret) throw new Error("SCHWAB_APP_KEY/SECRET not set");
  return Buffer.from(`${key}:${secret}`).toString("base64");
}

function redirectUri(): string {
  const u = process.env.SCHWAB_REDIRECT_URI;
  if (!u) throw new Error("SCHWAB_REDIRECT_URI not set");
  return u;
}

async function postToken(body: URLSearchParams): Promise<SchwabTokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth()}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Schwab token endpoint ${res.status}: ${text}`);
  }
  return (await res.json()) as SchwabTokenResponse;
}

export async function exchangeAuthCode(code: string): Promise<SchwabTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(),
  });
  return postToken(body);
}

async function refreshAccessToken(refreshToken: string): Promise<SchwabTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  return postToken(body);
}

// ---------- Token persistence ----------

interface StoredTokens {
  access_token: string;
  refresh_token: string;
  access_expires_at: string;
  refresh_expires_at: string;
}

export async function persistTokens(userId: string, tok: SchwabTokenResponse): Promise<void> {
  await persistProvidedTokens(userId, {
    accessToken: tok.access_token,
    refreshToken: tok.refresh_token,
    expiresIn: tok.expires_in,
  });
}

export async function persistProvidedTokens(
  userId: string,
  tok: ProvidedSchwabTokens,
): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const now = Date.now();
  const expiresIn = tok.expiresIn && tok.expiresIn > 0 ? tok.expiresIn : ACCESS_TTL_SEC;
  const access_expires_at =
    tok.accessExpiresAt ?? new Date(now + Math.max(expiresIn - 60, 60) * 1000).toISOString();
  const refresh_expires_at =
    tok.refreshExpiresAt ??
    new Date(
      now + (tok.refreshToken ? REFRESH_TTL_SEC : Math.max(expiresIn - 60, 60)) * 1000,
    ).toISOString();
  const { error } = await supabaseAdmin.from("schwab_tokens").upsert({
    user_id: userId,
    access_token: tok.accessToken,
    refresh_token: tok.refreshToken ?? "",
    access_expires_at,
    refresh_expires_at,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function getSchwabAccessToken(userId: string): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("schwab_tokens")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle<StoredTokens>();
  if (error || !data) throw new SchwabReauthRequired();

  if (new Date(data.access_expires_at).getTime() > Date.now() + 30_000) {
    return data.access_token;
  }
  if (!data.refresh_token || new Date(data.refresh_expires_at).getTime() < Date.now()) {
    throw new SchwabReauthRequired();
  }
  // Refresh
  try {
    const tok = await refreshAccessToken(data.refresh_token);
    await persistProvidedTokens(userId, {
      accessToken: tok.access_token,
      refreshToken: tok.refresh_token ?? data.refresh_token,
      expiresIn: tok.expires_in,
    });
    return tok.access_token;
  } catch (e) {
    console.error("[schwab] refresh failed:", e);
    throw new SchwabReauthRequired();
  }
}

export async function deleteSchwabTokens(userId: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("schwab_tokens").delete().eq("user_id", userId);
}

export async function getSchwabTokenInfo(
  userId: string,
): Promise<{ connected: boolean; accessExpiresAt?: string; refreshExpiresAt?: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("schwab_tokens")
    .select("access_expires_at, refresh_expires_at")
    .eq("user_id", userId)
    .maybeSingle<{ access_expires_at: string; refresh_expires_at: string }>();
  if (!data) return { connected: false };
  const live = new Date(data.refresh_expires_at).getTime() > Date.now();
  return {
    connected: live,
    accessExpiresAt: data.access_expires_at,
    refreshExpiresAt: data.refresh_expires_at,
  };
}

// ---------- REST helpers ----------

async function schwabGet(
  token: string,
  path: string,
  params: Record<string, string> = {},
): Promise<unknown> {
  const url = new URL(path, BASE);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) {
    console.error(`[schwab] ${path} ${res.status}: ${await res.text().catch(() => "")}`);
    return null;
  }
  return res.json();
}

interface PriceHistoryCandle {
  datetime: number; // ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export async function fetchSchwabPriceHistory(opts: {
  token: string;
  symbol: string;
  lookbackDays: number;
}): Promise<Candle[]> {
  const { token, symbol, lookbackDays } = opts;
  const end = Date.now();
  const start = end - lookbackDays * 24 * 3600 * 1000;
  const json = (await schwabGet(token, "/marketdata/v1/pricehistory", {
    symbol,
    periodType: "day",
    period: String(Math.min(lookbackDays, 10)),
    frequencyType: "minute",
    frequency: "1",
    startDate: String(start),
    endDate: String(end),
    needExtendedHoursData: "false",
  })) as { candles?: PriceHistoryCandle[] } | null;
  const raw = json?.candles ?? [];
  return raw.map((c) => ({
    time: Math.floor(c.datetime / 1000),
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
  }));
}

// Map Schwab's grouped chain to the same shape as Tradier's options array,
// so the existing computeGex() can be reused unchanged.
export interface UnifiedOption {
  symbol: string;
  strike: number;
  option_type: "call" | "put";
  open_interest?: number;
  greeks?: { gamma?: number; delta?: number } | null;
  expiration_date?: string;
}

interface SchwabContract {
  symbol: string;
  strikePrice: number;
  openInterest?: number;
  gamma?: number;
  delta?: number;
  expirationDate?: string;
}

type SchwabExpMap = Record<string, Record<string, SchwabContract[]>>;

interface SchwabChainResponse {
  underlyingPrice?: number;
  callExpDateMap?: SchwabExpMap;
  putExpDateMap?: SchwabExpMap;
}

export async function fetchSchwabChain(opts: {
  token: string;
  symbol: string;
  fromDate?: string; // YYYY-MM-DD
  toDate?: string; // YYYY-MM-DD
  contractType?: "ALL" | "CALL" | "PUT";
}): Promise<{ spot: number | null; options: UnifiedOption[] }> {
  const params: Record<string, string> = {
    symbol: opts.symbol,
    contractType: opts.contractType ?? "ALL",
    includeUnderlyingQuote: "true",
    strategy: "SINGLE",
  };
  if (opts.fromDate) params.fromDate = opts.fromDate;
  if (opts.toDate) params.toDate = opts.toDate;
  const json = (await schwabGet(
    opts.token,
    "/marketdata/v1/chains",
    params,
  )) as SchwabChainResponse | null;
  if (!json) return { spot: null, options: [] };
  const options: UnifiedOption[] = [];
  const flatten = (map: SchwabExpMap | undefined, type: "call" | "put") => {
    if (!map) return;
    for (const exp of Object.keys(map)) {
      for (const strike of Object.keys(map[exp])) {
        for (const c of map[exp][strike]) {
          options.push({
            symbol: c.symbol,
            strike: c.strikePrice,
            option_type: type,
            open_interest: c.openInterest,
            greeks: { gamma: c.gamma, delta: c.delta },
            expiration_date: c.expirationDate ?? exp.split(":")[0],
          });
        }
      }
    }
  };
  flatten(json.callExpDateMap, "call");
  flatten(json.putExpDateMap, "put");
  return { spot: json.underlyingPrice ?? null, options };
}

// ---------- Streamer session ----------

export interface SchwabStreamerSession {
  provider: "schwab";
  wsUrl: string;
  accessToken: string;
  schwabClientCustomerId: string;
  schwabClientCorrelId: string;
  schwabClientChannel: string;
  schwabClientFunctionId: string;
  symbols: string[];
}

interface UserPrefResponse {
  streamerInfo?: Array<{
    streamerSocketUrl?: string;
    schwabClientCustomerId?: string;
    schwabClientCorrelId?: string;
    schwabClientChannel?: string;
    schwabClientFunctionId?: string;
  }>;
}

export async function getSchwabStreamerSession(opts: {
  token: string;
  symbols: string[];
}): Promise<SchwabStreamerSession | null> {
  const json = (await schwabGet(
    opts.token,
    "/trader/v1/userPreference",
  )) as UserPrefResponse | null;
  const info = json?.streamerInfo?.[0];
  if (!info?.streamerSocketUrl) return null;
  return {
    provider: "schwab",
    wsUrl: info.streamerSocketUrl,
    accessToken: opts.token,
    schwabClientCustomerId: info.schwabClientCustomerId ?? "",
    schwabClientCorrelId: info.schwabClientCorrelId ?? "",
    schwabClientChannel: info.schwabClientChannel ?? "",
    schwabClientFunctionId: info.schwabClientFunctionId ?? "",
    symbols: opts.symbols,
  };
}
