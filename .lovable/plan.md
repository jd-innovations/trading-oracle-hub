## Goal
Fix readable-on-mobile issues surfaced by 390px screenshots of every route. No business-logic changes — only header, journal table, and chart toolbar presentation.

## Changes

### 1. `src/components/layout/AppShell.tsx` — header
- Truncate the subtitle to a single line: add `truncate` and remove any wrap. Hide it entirely below `sm` if still too tight (`hidden xs:block` isn't available; use `hidden sm:block` if needed, but first try `truncate` alone).
- Let the title use its full row: keep `truncate` but bump size only from `sm:`.
- Shrink the right cluster on mobile:
  - Schwab button: icon-only on mobile (hide the "Schwab" text with `sr-only sm:not-sr-only`), keep full label from `sm:`.
  - Reduce gap from `gap-2` → `gap-1.5` on mobile.

### 2. `src/components/layout/SessionClock.tsx`
- On mobile show only the time (`11:54`); hide the "ET" suffix and the "RTH OPEN / CLOSED" pill below `sm:`. Full display returns at `sm:` and above where there's room.

### 3. `src/routes/journal.tsx` — trade log table
- Below `md`, render the trade rows as a stacked card list (Date + Instrument badge on the top row, Setup on the second line, Bias + Result on the third). Keep the current table layout from `md:` and up.
- Filters block already stacks fine; leave it.

### 4. `src/components/charts/ChartToolbar.tsx`
- Make the toolbar single-row on mobile by tightening: `gap-2` → `gap-1.5`, buttons `px-2` → `px-1.5`, `text-[11px]` stays. On the Fullscreen button hide the "Fullscreen"/"Exit" label below `sm:` (icon-only on mobile). Same for "Fit" — icon-only on mobile.
- Keep `flex-wrap` as a safety net so if it still overflows it wraps gracefully rather than horizontal-scrolls.

### 5. Verification
- Re-run the same Playwright pass at 390×844 across `/`, `/analysis`, `/iron-fly`, `/journal`, `/performance`, `/balance-zones`.
- Confirm titles are no longer truncated with ellipsis, subtitle is single-line (or hidden), Journal rows are readable, and no route exceeds `document.scrollWidth === window.innerWidth (390)`.
- Also spot-check at 360px (small Android) since that's the practical floor.

## Out of scope
- No changes to data feeds, auto-trader, Discord, or chart rendering logic.
- No new components — presentational tweaks only.
