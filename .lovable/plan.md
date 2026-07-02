## Change

Update `src/lib/symbols.ts` so NQ's `minGap` is `80` (currently `25`). This is the only edit needed — `plan-generator.ts` already threads `minGap` through the structural target picker and the priorHigh/priorLow extension fallback, so the same skip-target logic applies automatically.

```ts
NQ: { id: "NQ", schwabRoot: "/NQ", label: "NQ", tickSize: 0.25, minGap: 80 },
```

ES stays at `minGap: 8`.

## Effect

- Each successive NQ target (T1→T2→T3, both up and down) must be at least 80 points from the prior level.
- Structural candidates closer than 80 pts get skipped; when the structural pool is exhausted, the priorHigh/priorLow + VA-range extension keeps stepping (0.25× VA increments) until the ≥80 pt gap is satisfied — identical logic to ES, just a larger gate.
- Next plan generation for NQ will reflect the new spacing; existing stored NQ plans are unchanged until regenerated.
