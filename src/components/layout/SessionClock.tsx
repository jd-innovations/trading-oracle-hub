import { useEffect, useState } from "react";
import { etNow, rthStatus } from "@/lib/format";

export function SessionClock() {
  const [time, setTime] = useState("--:--");
  const [status, setStatus] = useState({ label: "—", active: false });
  useEffect(() => {
    const tick = () => {
      setTime(etNow());
      setStatus(rthStatus());
    };
    tick();
    const id = setInterval(tick, 15_000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="flex items-center gap-2">
      <span className="mono text-xs text-muted-foreground">
        {time}
        <span className="hidden sm:inline"> ET</span>
      </span>
      <span
        className={`hidden sm:inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
          status.active
            ? "border-bull/30 bg-bull/10 text-bull"
            : "border-border bg-surface-2 text-muted-foreground"
        }`}
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${status.active ? "bg-bull animate-pulse" : "bg-muted-foreground"}`}
        />
        {status.label}
      </span>
    </div>
  );
}
