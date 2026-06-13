
# JD Trading Planner — Shell UI Plan

Build a frontend-only shell (no backend, no DB, no API calls) for a professional ES futures + SPX options trading planner. All sections populated with realistic dummy ES data.

## Scope

- Frontend only. Static dummy data in `src/lib/mock/`.
- Dark mode default with light toggle (class-based, persisted to localStorage).
- Mobile-first; responsive up to desktop.
- Charting via `lightweight-charts` (TradingView OSS).

## Visual direction

Trading-terminal aesthetic: near-black background, high-density typography, monospace for numbers, restrained accent colors.

- Background: deep neutral (#0A0B0D dark / #FAFAFA light)
- Surfaces: layered panels with hairline borders
- Accents: bull green, bear red, amber for pivot/warnings, blue for neutral/info
- Type: `JetBrains Mono` for prices/levels, `Inter` for prose, `Space Grotesk` for headings
- Dense, compact spacing; small caps for section labels; tabular-nums everywhere

Tokens defined in `src/styles.css` via `@theme` (oklch). No hardcoded colors in components.

## Routing (TanStack Start)

Bottom tab bar on mobile, left sidebar on desktop. Six routes:

```
src/routes/
  __root.tsx              shell: header + nav, theme provider, Outlet
  index.tsx               redirect → /plan (or render Plan directly)
  plan.tsx                Tab 1
  analysis.tsx            Tab 2
  iron-fly.tsx            Tab 3
  journal.tsx             Tab 4
  performance.tsx         Tab 5
  balance-zones.tsx       Tab 6
```

Each route sets its own `head()` metadata.

## Components

```
src/components/
  layout/
    AppShell.tsx           header + nav wrapper
    BottomTabs.tsx         mobile bottom nav (6 icons)
    SideNav.tsx            desktop left nav
    ThemeToggle.tsx
    SessionClock.tsx       ET time + RTH status pill
  plan/
    DailyPlanCard.tsx      exact Discord-format block
    PlanResultsCard.tsx    exact Discord-format results block
    LevelRail.tsx          visual T3↑..T3↓ ladder
  charts/
    EsCandleChart.tsx      lightweight-charts 2-min candles + level lines
    TpoProfile.tsx         canvas-rendered TPO letters w/ POC/VAH/VAL shading
    SpxChart.tsx           lightweight-charts for Iron Fly
  analysis/
    NakedLevelsList.tsx
    StructuralFlags.tsx    poor high/low, spikes, tails, single prints
    BalanceZonePanel.tsx
  ironfly/
    TradeRecCard.tsx       strikes, credit, BE, max risk
    GexLevelsTable.tsx
    UpdateFeed.tsx         30-min timeline of posts
  journal/
    JournalTable.tsx       filter by date + instrument (ES / SPX)
  performance/
    StatTiles.tsx          bias acc, T1/T2/T3 hit %, ext hit %
    WindowSelector.tsx     L5 / L10 / L20 / All
    EquityCurve.tsx        lightweight-charts area
  balance/
    OtfBadges.tsx          daily + weekly OTF up/down/none
    ZoneTable.tsx          high / halfback / low / breakout status
  ui/                      shadcn (already present)
```

## Dummy data

`src/lib/mock/` modules export typed fixtures:

- `dailyPlan.ts` — today's plan (T1/T2/T3 up, pivot, T1/T2/T3 down, bias, context, events)
- `planResults.ts` — yesterday's scored result
- `esCandles.ts` — ~200 bars of 2-min ES OHLC around the levels
- `tpo.ts` — 30-min TPO letter rows, POC/VAH/VAL
- `nakedLevels.ts`, `structuralFlags.ts`, `balanceZones.ts`
- `ironFly.ts` — current rec + 30-min updates
- `spxCandles.ts`, `gexLevels.ts`
- `journal.ts` — ~40 entries mixed ES/SPX
- `performance.ts` — stats per rolling window + equity points

## Tab contents

1. **Plan** — `DailyPlanCard` (exact format, copy-to-clipboard button), `LevelRail`, `EsCandleChart` with level lines, `TpoProfile`, `PlanResultsCard` for previous session.
2. **Analysis** — `TpoProfile` (larger), `NakedLevelsList`, `StructuralFlags`, `BalanceZonePanel`.
3. **Iron Fly** — `TradeRecCard`, `GexLevelsTable`, `SpxChart`, `UpdateFeed`.
4. **Journal** — `JournalTable` with date range + instrument filter, P&L column, expandable rows.
5. **Performance** — `WindowSelector`, `StatTiles`, `EquityCurve`, hit-rate breakdown table.
6. **Balance Zones** — `OtfBadges` (daily/weekly), `ZoneTable`, mini chart with zone overlay.

## Technical notes

- Install: `lightweight-charts`, `date-fns`. Icons via existing `lucide-react`.
- Theme: add `.dark` class on `<html>`; toggle persisted in `localStorage`; default dark on first load.
- Number formatting: helper `formatPrice(n)` → 2 decimals, tabular-nums. Time helper for ET.
- Daily Plan + Results text blocks rendered from a single template function so the format is locked and reusable (clipboard copy returns identical string).
- All charts lazy-import `lightweight-charts` inside `useEffect` to avoid SSR `window` issues.
- No server functions, no Cloud, no auth.

## Out of scope (explicit)

- No Discord integration, no scheduling, no scoring logic, no GEX calculation, no persistence.
- Results/scoring shown are static dummy values.

Ready to build on approval.
