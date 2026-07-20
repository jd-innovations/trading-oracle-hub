## Problem
The Auto-Trader `Panel` header packs the title ("Auto-Trader · MES (LONG)") plus 7 control chips/buttons (status pill, On/Off, Auto, Reset, Test event, Post, Copy) into a single grid row. On mobile the control cluster consumes the full width, forcing the title to truncate to "Auto-Trad…" — and the status pill text ("ARMED · NEUTRAL → LONG (T2↓/T3↓)") itself is long enough to overflow.

## Changes (presentational only)

### 1. `src/components/layout/AppShell.tsx` — `Panel`
Let the header wrap on narrow widths instead of forcing a single row:
- Change the header from `grid grid-cols-[minmax(0,1fr)_auto]` to `flex flex-wrap items-center justify-between gap-x-3 gap-y-2`.
- Keep the title in a `min-w-0 flex-1` wrapper so it can still truncate when it does share the row on wider screens.
- Right slot gets `flex flex-wrap items-center gap-1.5` so buttons wrap onto a second line on mobile rather than crushing the title.

This is a shared component — verified all other panels (Daily Plan, Session Results, GEX, etc.) already use short `right` clusters and will simply keep their current single-row layout at ≥sm.

### 2. `src/components/auto-trader/TradeCard.tsx` — controls row
- Wrap `controls` in `flex flex-wrap items-center gap-1.5 justify-end` (was `flex items-center gap-1.5`), so on mobile the row breaks cleanly.
- Shorten the status pill copy on mobile:
  - "ARMED · NEUTRAL → LONG (T2↓/T3↓)" → drop the parenthetical below `sm:` (render short/long variants).
  - Long "IN TRADE · NEUTRAL · SHORT · 3x" → below `sm:` render "IN · SHORT · 3x".
  - Implement by returning both a `textShort` and `textLong` and rendering `<span class="sm:hidden">{short}</span><span class="hidden sm:inline">{long}</span>` inside the pill.
- Hide button text labels below `sm:` for the low-signal buttons, keep icons:
  - Reset, Test event, Post, Copy: wrap the trailing word in `<span class="hidden sm:inline">…</span>`.
  - Keep "On/Off" and "Auto" labels visible (state-carrying).
- Shorten the panel title on mobile by dropping the mode segment: use `Auto-Trader · ${micro}` and render `(${modeLabel})` in a `hidden sm:inline` span. Since the title is a plain string prop, switch to passing a small JSX node — allowed because `Panel`'s `title` prop is currently typed `string`; widen it to `ReactNode` in step 1.

### 3. Verification
- Playwright at 360×844 and 390×844 on `/` (ES) and `/` after toggling NQ — confirm:
  - Panel title reads "Auto-Trader · MES" with no ellipsis.
  - Controls wrap to a second row, no horizontal scroll.
  - Status pill fits within the row.
- Spot-check ≥`sm` (≥640px) to confirm the header still renders on a single row with full labels.

## Out of scope
Auto-trader logic, Discord flow, chart, and other panels' contents.