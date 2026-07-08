## Wire live data into TPO Profile + tighten Plan Results

Two panels still show mock data. Plan Results already runs a live server fn (`computePlanResultsFn`) but silently falls back to `mock/data.planResult` when there's no plan or no auth — user reads a stale mock and thinks it's live. TpoProfile is 100% mock (`tpoRows`, `tpoStats` from `src/lib/mock/data.ts`).

### 1. TpoProfile → live TPO from prior RTH session

Reuse the existing profile math (`computeTpoProfile` is already in `src/lib/profile-levels.ts`, exercised by the chart overlay) instead of shipping a second copy.

**a. `src/lib/profile-levels.ts`**
- Export `computeTpoProfile` and the internal `groupRthSessions` helper so consumers can pull the prior-RTH profile without recomputing sessions. `TpoProfile` (interface) is already declared — export it too.
- Add a small helper `getPriorRthProfile(bars: Candle[]): { rows: {price:number; letters:string}[]; poc:number; vah:number; val:number } | null` that: groups sessions, picks the last completed RTH session, and returns the per-price-bin bracket letters (A, B, C, …) plus POC/VAH/VAL. Bracket letters come from the same 30-min bucketing already used inside `computeTpoProfile`; we just also keep the mapping `bin -> sorted bracket indices` and render `String.fromCharCode(65 + idx)`.

**b. New hook `src/lib/use-tpo-profile.ts`**
```ts
export function useTpoProfile(symbol: string) {
  const { base1m, source } = useEsFeed("2m", symbol);
  const profile = useMemo(() => getPriorRthProfile(base1m), [base1m]);
  return { profile, source };
}
```
No new network calls — piggybacks on `useEsFeed`'s 1-minute Schwab pull that the chart already runs.

**c. `src/components/charts/TpoProfile.tsx`** — rewrite to render from props:
```ts
interface Props {
  compact?: boolean;
  symbol?: string;           // "/ES" | "/NQ"
}
```
Inside, call `useTpoProfile(symbol ?? "/ES")`. Show:
- Header row VAH/POC/VAL from live stats (fall back to `—` when `profile` is null).
- Empty state: "Waiting for Schwab bars…" when `source === "mock"` or no session yet.
- Rows: iterate `profile.rows` sorted by price desc (same layout as today).

**d. Update the two call sites:**
- `src/routes/index.tsx` line 227: `<TpoProfile compact symbol={SYMBOL_ROOTS[symbolId]} />` — follows the ES/NQ toggle.
- `src/routes/analysis.tsx` line 23: `<TpoProfile />` for now (defaults to /ES). Follow-up if analysis grows a symbol switcher.

**e. Delete `tpoRows` and `tpoStats` from `src/lib/mock/data.ts`** — only TpoProfile used them.

### 2. Plan Results — drop mock fallback

Panel currently reads `const r = live ?? planResult` and stamps "MOCK" when unauthed / no saved plan. Change so the panel reflects reality:

- Remove the `planResult` import in `src/routes/index.tsx` and the `?? planResult` fallback.
- When `!live`: render an empty state inside the Panel with the `err` message (or a neutral "Generate a plan first, then grade it." when there's no error). Keep the "Grade Plan" button.
- Score chip and Copy button render only when `live` exists.
- Drop the `MOCK` badge branch; keep "LIVE · SCHWAB" only when `live` is set.

`planResult` and `resultToText`'s dependency on the mock shape stay untouched; the export in `mock/data.ts` can remain (used by nothing else after this change, but out of scope to delete).

### Files touched

- `src/lib/profile-levels.ts` — export + `getPriorRthProfile`.
- `src/lib/use-tpo-profile.ts` — new.
- `src/components/charts/TpoProfile.tsx` — prop/hook rewrite.
- `src/routes/index.tsx` — pass symbol prop; drop mock plan-result fallback.
- `src/routes/analysis.tsx` — pass through default.
- `src/lib/mock/data.ts` — remove now-dead `tpoRows` / `tpoStats`.

### Verification

- Load `/` on ES: TPO panel POC/VAH/VAL match the chart's yellow/green/red rays; toggle to NQ and confirm the profile updates within one poll (≤60 s).
- Load `/analysis`: TPO shows live ES letters, not the 6080-area mock prints.
- Unauth or no saved plan on `/`: Plan Results shows the empty-state message, no fake "T3↓ 5988: ❌ Missed" grid.
- After `generateDailyPlan` + `computePlanResultsFn`: card fills with live results and shows the `LIVE · SCHWAB` chip.
