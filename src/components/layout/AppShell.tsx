import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Plug } from "lucide-react";
import { BottomTabs, SideNav } from "./Nav";
import { SessionClock } from "./SessionClock";
import { ThemeToggle } from "./ThemeToggle";

export function AppShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <SideNav />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border bg-background/90 px-4 py-3 backdrop-blur md:px-6">
          <div className="min-w-0">
            <div className="label-xs">{subtitle ?? "JD Trading Planner"}</div>
            <h1 className="display truncate text-lg font-bold leading-tight sm:text-xl">
              {title}
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <SessionClock />
            <ThemeToggle />
          </div>
        </header>
        <main className="min-w-0 flex-1 px-3 pb-24 pt-3 md:px-6 md:pb-8 md:pt-5">
          {children}
        </main>
        <BottomTabs />
      </div>
    </div>
  );
}

export function Panel({
  title,
  right,
  children,
  className = "",
}: {
  title?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-lg border border-border bg-card shadow-sm ${className}`}
    >
      {(title || right) && (
        <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-border px-4 py-2.5">
          {title ? <h2 className="label-xs">{title}</h2> : <span />}
          {right}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}
