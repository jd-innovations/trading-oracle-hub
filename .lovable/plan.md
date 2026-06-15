## Change

Only render **naked** (never-touched) 30m POCs. As soon as any later bar's range touches a 30m POC price, drop it entirely instead of drawing a short ray to the touch bar.

### Where

`src/lib/profile-levels.ts` — in `computeProfileLevels`, inside the `opts.include30m` branch, skip pushing the level when `broken === true`:

```ts
if (broken) continue;
levels.push({ kind: "poc30m", ... });
```

### Scope

- Applies to **30m POCs only**, per the screenshot. Session POC/VAH/VAL/singles/poor H-L keep their current behavior (extend from session close to first touch, then stop).
- No UI changes, no primitive changes.
