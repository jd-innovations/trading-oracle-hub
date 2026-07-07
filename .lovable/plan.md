## Two fixes in `src/routes/index.tsx`

### 1. Upside target sequence — display T1 → T2 → T3 (currently reversed)

Today the Discord-format block renders the upside line as:

```
T3↑ 6420  >>  T2↑ 6410  >>  T1↑ 6400
Daily Pivot: 6390 / Now trading at 6390
T1↓ 6380  >>  T2↓ 6370  >>  T3↓ 6360
```

You want the upside to read the same direction as the downside — nearest target first, farthest last:

```
T1↑ 6400  >>  T2↑ 6410  >>  T3↑ 6420
Daily Pivot: 6390 / Now trading at 6390
T1↓ 6380  >>  T2↓ 6370  >>  T3↓ 6360
```

Change is one line inside `DailyPlanCard` (~line 270):

```tsx
<span className="text-bull">{`T1↑ ${fmtPrice(p.t1Up)} >> T2↑ ${fmtPrice(p.t2Up)} >> T3↑ ${fmtPrice(p.t3Up)}`}</span>
```

The `LevelRail` rows (top-to-bottom T3↑, T2↑, T1↑, Pivot, T1↓, T2↓, T3↓) stay unchanged — that layout is spatial (higher price = higher on screen) and is correct as-is. Underlying plan generation (`plan-generator.ts` → T1 is the closest structural level above/below pivot, T2 next, T3 farthest) is already correct; this is purely a display order fix for the copy-paste block.

### 2. "Daily Pivot" and "Now trading at" always match — why, and the fix

**Why they match today:** in `PlanPage` we hydrate the view with

```ts
setPlan(rowToView(r.plan, Number(r.plan.pivot)));   // 3 call sites
```

The second argument is the "now" price. It was stubbed to `pivot` and never replaced with a live quote, so the "Now trading at" number is literally the pivot. It is not reading from Schwab.

**Fix:** feed the live last price from the existing Schwab-backed hook `useEsFeed` (already used by `EsChartPanel`, already switched to Schwab in the earlier change). Add in `PlanPage`:

```ts
import { useEsFeed } from "@/lib/use-es-feed";

const { lastPrice } = useEsFeed("1m", SYMBOL_ROOTS[symbolId]); // "/ES" or "/NQ"
```

(If `useEsFeed` doesn't already surface `lastPrice`, add a derived `lastPrice = bars.at(-1)?.close` selector in that hook — no new network calls.)

Then keep the plan row in state as the raw row and derive `PlanView` on render:

```ts
const [planRow, setPlanRow] = useState<DailyPlanRow | null>(null);
const plan = planRow ? rowToView(planRow, lastPrice ?? Number(planRow.pivot)) : null;
```

Replace the three `setPlan(rowToView(..., Number(...pivot)))` call sites with `setPlanRow(...)`. Result: "Now trading at" updates in real time from the same Schwab stream the chart uses, and only falls back to the pivot number when the stream hasn't produced a tick yet (initial mount, after-hours, reconnect).

No changes to `plan-generator.ts`, `plans.functions.ts`, or the DB schema.

### Verification

- Open `/` on both ES and NQ, confirm upside line reads `T1↑ … >> T2↑ … >> T3↑ …` with ascending prices.
- Watch "Now trading at" during RTH — it should drift while "Daily Pivot" stays fixed.
- Copy the Discord block and confirm the plain-text `planToText` output (in `src/lib/format.ts` or wherever it lives) matches the new order; update that helper too if it hardcodes the reversed sequence.
