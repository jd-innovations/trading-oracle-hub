## Fix: pivot should be the closest structural level to the current price

### Problem

Today `generatePlanFromBars` picks pivot from only prior-session `{VAH, POC, VAL}`:

```ts
const pivotRef = structural.reduce((best, cur) =>
  Math.abs(cur.price - anchor) < Math.abs(best.price - anchor) ? cur : best,
);
```

In the NQ example the anchor is 29,176.75. A naked 30m POC sits at 29,210 (much closer), but the algorithm ignores it and picks VAL 29,323.75 — so 29,210 ends up as T1↓ instead of pivot.

### Change (one file: `src/lib/plan-generator.ts`)

Widen the pivot candidate pool to every structural level we already collect, then pick the nearest to `anchor`:

```ts
const pivotPool = [
  tpo.vah, tpo.poc, tpo.val,
  priorHigh, priorLow,
  ...nakedStructs.map(s => s.price),   // naked H/L/VAH/POC/VAL, last 25 sess
  ...nakedUniq,                        // naked 30m POCs, last 25 sess
].map(roundTick);

const pivot = pivotPool.reduce((best, cur) =>
  Math.abs(cur - anchor) < Math.abs(best - anchor) ? cur : best
);
```

Then the target pool becomes every remaining structural level (exclude only `pivot`), split above/below and fed to the existing `pickTargets` (which already enforces the 8pt / 80pt `MIN_GAP` skip logic):

```ts
const remaining = uniq(pivotPool.filter(p => p !== pivot));
const above = remaining.filter(p => p > pivot).sort((a, b) => a - b);
const below = remaining.filter(p => p < pivot).sort((a, b) => b - a);
```

`pickTargets` already falls back to prior H/L + ¼·VA extensions when the structural pool runs out, so extension behavior is unchanged.

### Downstream

- `pivotRef.name` is used only in the context string (`"...pivot 29323.75 (VAL)"`). Since pivot can now be any type (H, L, VAH, POC, VAL, 30m POC), tag it generically — either drop the `(VAL)` suffix or label it by matched source (e.g. `(naked POC)`). Small cosmetic tweak in the two `biasNote` template strings.
- `PlanView` / `rowToView` / DB schema / Discord format / `LevelRail`: no changes. They only read `pivot` as a number.
- Live "Now trading at" already flows from `useEsFeed` (previous fix) — unrelated.

### Verification

Re-run today's NQ plan against the same bars:

- Anchor 29,176.75 → nearest level is 29,210 (naked POC) → **pivot = 29,210**.
- 29,323.75 (VAL) drops into the upside ladder as T1↑ / T2↑ depending on the 80pt skip rule.
- 29,502.50 remains a valid upside target (>80pt from 29,323.75).
- ES: rerun and confirm pivot lands on whichever level (VAH/POC/VAL/H/L/naked POC) is nearest to the current anchor — you mentioned 7,529.50 is the expected value; that will be true iff 7,529.50 is one of the collected structural levels and is closer to the ES anchor than any other. If it's not appearing, the follow-up is to check whether it's being computed at all (naked POC scan window, tick rounding).

No schema, RLS, or route changes.
