import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { getTradeDetail } from "@/lib/trade-detail.functions";
import type { TradeEvent } from "@/lib/auto-trader/state";
import { pointValueFor } from "@/lib/symbols";
import { fmtPrice, fmtSigned } from "@/lib/format";

export interface TradeDetailTarget {
  symbol: "ES" | "NQ";
  planDate: string;
  side: "long" | "short" | null;
  entryLabel: string | null;
  entryPrice: number | null;
  exitLabel: string | null;
  exitPrice: number | null;
  entryTime: string | null;
  exitTime: string | null;
  phase: "closed_win" | "stopped" | null;
  realizedPoints: number | null;
  contracts: number | null;
  mfe: number | null;
  mae: number | null;
  mfeTime: string | null;
}

function fmtDate(d: string): string {
  const [y, m, day] = d.split("-");
  return `${m}/${day}/${y}`;
}
function etTime(ts: string | null): string {
  if (!ts) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ts));
}
function etFromSeconds(t: number): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(t * 1000));
}

const EVENT_META: Record<
  TradeEvent["kind"],
  { label: string; tone: string; dot: string }
> = {
  entry: { label: "Entry", tone: "text-foreground", dot: "bg-info" },
  scale1: { label: "Scale-out 1 · stop to break-even", tone: "text-bull", dot: "bg-bull" },
  scale2: { label: "Scale-out 2 · stop to first target", tone: "text-bull", dot: "bg-bull" },
  stop_moved: { label: "Runner · stop trailed", tone: "text-bull", dot: "bg-bull" },
  target_hit: { label: "Final target reached", tone: "text-bull", dot: "bg-bull" },
  ext1_hit: { label: "Extension target hit · runner closed", tone: "text-bull", dot: "bg-bull" },
  stop_hit: { label: "Stop hit", tone: "text-bear", dot: "bg-bear" },
  closed: { label: "Position flat", tone: "text-muted-foreground", dot: "bg-muted-foreground" },
  leg_closed: { label: "Leg closed · re-armed", tone: "text-muted-foreground", dot: "bg-muted-foreground" },
};

export function TradeDetailSheet({
  trade,
  onClose,
}: {
  trade: TradeDetailTarget | null;
  onClose: () => void;
}) {
  const fetchDetail = useServerFn(getTradeDetail);
  const q = useQuery({
    enabled: !!trade,
    queryKey: ["trade-detail", trade?.symbol, trade?.planDate, trade?.entryTime],
    queryFn: () =>
      fetchDetail({
        data: {
          symbol: trade!.symbol,
          planDate: trade!.planDate,
          entryTime: trade!.entryTime ?? null,
        },
      }),
  });

  const pts = Number(trade?.realizedPoints ?? 0);
  const usd = trade ? pts * pointValueFor(trade.symbol) : 0;
  const events = q.data?.events ?? [];
  const scaleCount = events.filter((e) => e.kind === "scale1" || e.kind === "scale2").length;
  const trails = events.filter((e) => e.kind === "stop_moved").length;

  return (
    <Sheet open={!!trade} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        {trade && (
          <>
            <SheetHeader>
              <SheetTitle className="flex flex-wrap items-center gap-2">
                <span className="mono text-sm">{fmtDate(trade.planDate)}</span>
                <span className="mono rounded bg-surface-2 px-1.5 py-0.5 text-xs font-semibold">
                  {trade.symbol}
                </span>
                <span
                  className={`text-xs font-semibold uppercase ${
                    trade.phase === "closed_win" ? "text-bull" : "text-bear"
                  }`}
                >
                  {trade.side === "short" ? "SHORT" : "LONG"}
                  {trade.phase === "closed_win" ? " · WIN" : trade.phase === "stopped" ? " · LOSS" : ""}
                </span>
              </SheetTitle>
            </SheetHeader>

            {/* Summary */}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Cell k="Entry" v={`${trade.entryLabel ?? "—"} @ ${trade.entryPrice != null ? fmtPrice(Number(trade.entryPrice)) : "—"}`} sub={etTime(trade.entryTime)} />
              <Cell k="Exit" v={`${trade.exitLabel ?? "exit"} @ ${trade.exitPrice != null ? fmtPrice(Number(trade.exitPrice)) : "—"}`} sub={etTime(trade.exitTime)} />
              <Cell k="Result (points)" v={fmtSigned(pts)} tone={pts >= 0 ? "text-bull" : "text-bear"} sub={`${trade.contracts ?? 3}x position`} />
              <Cell k="Result (USD)" v={fmtSigned(usd)} tone={usd >= 0 ? "text-bull" : "text-bear"} sub={`$${pointValueFor(trade.symbol)} / point`} />
            </div>

            {/* Excursion */}
            {(trade.mfe != null || trade.mae != null) && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Cell
                  k="Peak in favor"
                  v={`+${Number(trade.mfe ?? 0).toFixed(2)} pts`}
                  tone="text-bull"
                  sub={trade.mfeTime ? `at ${etTime(trade.mfeTime)} ET` : "per contract"}
                />
                <Cell
                  k="Worst against"
                  v={`${Number(trade.mae ?? 0).toFixed(2)} pts`}
                  tone="text-bear"
                  sub="per contract"
                />
              </div>
            )}

            {/* Scale-out summary */}
            <div className="mt-3 rounded-md border border-border bg-surface-1 p-3 text-xs text-muted-foreground">
              {q.isLoading
                ? "Loading trade timeline…"
                : scaleCount === 0
                  ? "No contracts were scaled out — the full position was closed in one go, so the stop never moved off its starting level."
                  : `${scaleCount} contract${scaleCount > 1 ? "s" : ""} scaled out${
                      trails ? `, then the runner's stop trailed ${trails} time${trails > 1 ? "s" : ""}` : ""
                    }.`}
            </div>

            {/* Timeline */}
            <div className="mt-4">
              <div className="label-xs mb-2">Timeline</div>
              {q.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : q.isError ? (
                <p className="text-sm text-bear">Couldn't load the timeline for this trade.</p>
              ) : !events.length ? (
                <p className="text-sm text-muted-foreground">
                  The step-by-step record for this session wasn't saved, so only the entry, exit and
                  result above are available.
                </p>
              ) : (
                <ol className="space-y-3">
                  {events.map((e, i) => {
                    const meta = EVENT_META[e.kind];
                    return (
                      <li key={`${e.kind}-${e.time}-${i}`} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${meta.dot}`} />
                          {i < events.length - 1 && <span className="mt-1 w-px flex-1 bg-border" />}
                        </div>
                        <div className="min-w-0 flex-1 pb-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className={`text-xs font-semibold ${meta.tone}`}>{meta.label}</span>
                            <span className="mono shrink-0 text-[10px] text-muted-foreground">
                              {etFromSeconds(e.time)} ET
                            </span>
                          </div>
                          <div className="mono mt-0.5 text-xs text-muted-foreground">
                            {e.note ?? `${e.label ? `${e.label} · ` : ""}${fmtPrice(e.price)}`}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Cell({ k, v, sub, tone = "" }: { k: string; v: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-md border border-border bg-surface-1 p-2.5">
      <div className="label-xs">{k}</div>
      <div className={`mono mt-1 text-sm font-bold ${tone}`}>{v}</div>
      {sub && <div className="mono mt-0.5 text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
