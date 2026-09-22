# Trade detail view: click a trade, see the whole story

Short answer: no, that wasn't part of the last plan. The peak/worst work only added two numbers per trade. Here's the plan to add the drill-down.

## What you'll get

On both the Journal and Performance pages, every trade row (and mobile card) becomes clickable. Clicking opens a detail panel for that trade showing:

- **Header** — instrument, date, direction, entry level and price, exit level and price, result in points and dollars.
- **Timeline** — the full sequence of what happened, in order with timestamps:
  - entry (3 contracts, initial stop level and price)
  - first target tagged: 1 contract off, stop to break-even
  - second target tagged: another contract off, stop to the first target
  - each further target: runner's stop trails one level behind
  - stop hit / extension target hit / leg closed
- **Excursion** — peak in your favor and worst against you, per contract, with the time the peak happened (for trades recorded after the tracking went live).
- **Scale-out summary** — how many contracts came off and where, plus what the runner did.

On desktop it opens as a side sheet; on mobile as a full-height drawer.

## Where the data comes from

The step-by-step events were already being saved every day by the live runner, alongside the daily state — they just were never shown anywhere. Days going back to July have them.

## Technical notes

- New authenticated server function `getTradeDetail` (in a new `src/lib/trade-detail.functions.ts`) takes symbol + plan_date, reads the `auto_trader_state` row, and returns its `state.events` array plus the matching `completedLegs` entry.
  - `auto_trader_state` currently has only a SELECT policy for the owner — that's all this needs; no migration.
  - When several legs closed on one day (neutral re-arm days), events are split into legs on `leg_closed` / `closed` boundaries and matched to the clicked trade by entry time.
- New `src/components/trade/TradeDetailSheet.tsx` using the existing `sheet` primitive, rendering a typed timeline from the `TradeEvent` kinds already defined in `src/lib/auto-trader/state.ts` (`entry`, `scale1`, `scale2`, `stop_moved`, `target_hit`, `ext1_hit`, `stop_hit`, `closed`, `leg_closed`).
- `src/routes/journal.tsx` and `src/routes/performance.tsx`: row/card click handlers set selected trade state; data fetched with `useQuery` on open (not in a loader — the function is auth-protected).
- Dollar conversion reuses `pointValueFor` from `src/lib/symbols.ts`.
- Days whose events were never saved fall back to a short message and still show entry/exit/result.
