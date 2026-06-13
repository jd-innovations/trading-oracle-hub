import { tpoRows, tpoStats } from "@/lib/mock/data";
import { fmtPrice } from "@/lib/format";

export function TpoProfile({ compact = false }: { compact?: boolean }) {
  const maxLen = Math.max(...tpoRows.map((r) => r.letters.length));
  const { poc, vah, val } = tpoStats;

  return (
    <div className="rounded-md border border-border bg-surface-1">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-2 border-b border-border px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span>TPO · RTH</span>
        <span>VAH <span className="mono text-foreground">{fmtPrice(vah)}</span></span>
        <span>POC <span className="mono text-pivot">{fmtPrice(poc)}</span></span>
        <span>VAL <span className="mono text-foreground">{fmtPrice(val)}</span></span>
      </div>
      <div className={`overflow-auto ${compact ? "max-h-[340px]" : "max-h-[520px]"}`}>
        <div className="divide-y divide-border/40">
          {tpoRows.map((r) => {
            const inVA = r.price <= vah && r.price >= val;
            const isPoc = Math.abs(r.price - poc) < 0.01;
            return (
              <div
                key={r.price}
                className={`grid grid-cols-[68px_minmax(0,1fr)] items-center px-3 py-[2px] text-[11px] ${
                  isPoc ? "bg-pivot/15" : inVA ? "bg-info/[0.06]" : ""
                }`}
              >
                <span className="mono text-muted-foreground">{fmtPrice(r.price)}</span>
                <span
                  className={`mono tracking-widest ${isPoc ? "text-pivot font-bold" : "text-foreground"}`}
                  style={{
                    opacity: 0.5 + (r.letters.length / Math.max(maxLen, 1)) * 0.5,
                  }}
                >
                  {r.letters}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
