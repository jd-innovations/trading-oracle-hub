import type { DailyPlan, PlanResult } from "./mock/data";

export const fmtPrice = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtSigned = (n: number) =>
  (n >= 0 ? "+" : "") + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function planToText(p: DailyPlan): string {
  return [
    `Daily Plan: ${p.symbol}`,
    `$ES FUTURES ${p.date}`,
    ``,
    `T1↑ ${fmtPrice(p.t1Up)} >> T2↑ ${fmtPrice(p.t2Up)} >> T3↑ ${fmtPrice(p.t3Up)}`,
    `Daily Pivot: ${fmtPrice(p.pivot)} / Now trading at ${fmtPrice(p.now)}`,
    `T1↓ ${fmtPrice(p.t1Dn)} >> T2↓ ${fmtPrice(p.t2Dn)} >> T3↓ ${fmtPrice(p.t3Dn)}`,
    `@everyone`,
    ``,
    `Bias: ${p.bias} — ${p.biasReason}`,
    `Context: ${p.context}`,
    p.events ? `Events: ${p.events}` : ``,
  ]
    .filter(Boolean)
    .join("\n");
}

export function resultToText(r: PlanResult): string {
  const mark = (b: boolean) => (b ? "✅" : "❌");
  const tline = (dir: "↑" | "↓", i: number, t: { price: number; hit: boolean; time?: string }) =>
    `${dir} T${i} ${fmtPrice(t.price)}: ${t.hit ? `✅ Hit ${t.time}` : `❌ Missed`}`;
  return [
    `📊 Daily Plan Results — ${r.date}`,
    ``,
    `Bias: ${r.bias} ${mark(r.biasHit)}`,
    `Pivot ${fmtPrice(r.pivot)}: ${r.pivotHeld ? "Held ✅" : "Failed ❌"}`,
    ``,
    tline("↑", 1, r.ups[0]),
    tline("↑", 2, r.ups[1]),
    tline("↑", 3, r.ups[2]),
    ``,
    tline("↓", 1, r.dns[0]),
    tline("↓", 2, r.dns[1]),
    tline("↓", 3, r.dns[2]),
    ``,
    `Session: H ${fmtPrice(r.high)} / L ${fmtPrice(r.low)} / C ${fmtPrice(r.close)}`,
    `Score: ${r.score}/100`,
    `@everyone`,
  ].join("\n");
}

export function etNow(): string {
  return new Date().toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function rthStatus(): { label: string; active: boolean } {
  const et = new Date().toLocaleString("en-US", { timeZone: "America/New_York" });
  const d = new Date(et);
  const mins = d.getHours() * 60 + d.getMinutes();
  const open = 9 * 60 + 30;
  const close = 16 * 60;
  const day = d.getDay();
  if (day === 0 || day === 6) return { label: "Closed (Weekend)", active: false };
  if (mins < open) return { label: "Pre-Market", active: false };
  if (mins >= close) return { label: "After Hours", active: false };
  return { label: "RTH Open", active: true };
}
