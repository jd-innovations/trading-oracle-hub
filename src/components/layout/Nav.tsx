import { Link } from "@tanstack/react-router";
import {
  LineChart,
  LayoutGrid,
  Boxes,
  BookText,
  Activity,
  Layers,
} from "lucide-react";

export const NAV_ITEMS = [
  { to: "/", label: "Plan", icon: LineChart },
  { to: "/analysis", label: "Analysis", icon: LayoutGrid },
  { to: "/iron-fly", label: "Iron Fly", icon: Boxes },
  { to: "/journal", label: "Journal", icon: BookText },
  { to: "/performance", label: "Perf", icon: Activity },
  { to: "/balance-zones", label: "Zones", icon: Layers },
] as const;

export function BottomTabs() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur md:hidden">
      <ul className="grid grid-cols-6">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.to}>
              <Link
                to={item.to}
                activeOptions={{ exact: true }}
                className="flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium text-muted-foreground data-[status=active]:text-foreground"
              >
                <Icon className="h-5 w-5" />
                <span className="tracking-wide">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  );
}

export function SideNav() {
  return (
    <aside className="hidden w-56 shrink-0 border-r border-border bg-surface-1 md:flex md:flex-col">
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <div className="grid h-7 w-7 place-items-center rounded-md bg-foreground text-background">
          <span className="mono text-xs font-black">JD</span>
        </div>
        <div className="display text-sm font-bold leading-none">
          Trading
          <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Planner
          </div>
        </div>
      </div>
      <ul className="flex-1 space-y-0.5 p-2">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.to}>
              <Link
                to={item.to}
                activeOptions={{ exact: true }}
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground data-[status=active]:bg-surface-2 data-[status=active]:text-foreground"
              >
                <Icon className="h-4 w-4" />
                {item.label === "Perf" ? "Performance" : item.label === "Zones" ? "Balance Zones" : item.label}
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="border-t border-border p-3 text-[10px] uppercase tracking-widest text-muted-foreground">
        v0.1 · shell
      </div>
    </aside>
  );
}
