# Why the charts are blank

The runtime error tells the whole story:

```
Failed to parse color: lab(93.0481% -.822932 -1.65209)
  at lightweight-charts...
```

Our theme tokens in `src/styles.css` are defined in `oklch()` (modern CSS color). When `Charts.tsx` reads them via `getComputedStyle(...).getPropertyValue('--card')`, the browser returns the raw `oklch(...)` / `lab(...)` string. `lightweight-charts` only parses legacy CSS color formats (hex / rgb / rgba / named) — it throws on `oklch` and `lab`, which kills the chart mount. That's also what triggers the React #418 hydration error you see right after — the failed effect leaves the SSR markup and client tree out of sync.

So: charting is wired up correctly, the data is there, the library just can't read our color tokens.

## Fix

Add one small helper and use it everywhere a CSS variable is handed to `lightweight-charts`.

### 1. New helper `src/lib/color.ts`

```ts
// Resolve any CSS color string (oklch, lab, hsl, var(...), named)
// into an rgb()/rgba() string the lightweight-charts parser accepts.
export function toRgb(cssColor: string, fallback = "#888"): string {
  if (typeof window === "undefined") return fallback;
  const probe = document.createElement("span");
  probe.style.color = cssColor || fallback;
  probe.style.display = "none";
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color; // always rgb()/rgba()
  probe.remove();
  return resolved || fallback;
}
```

The browser's computed-style pass normalizes every modern color format to `rgb(r g b)` / `rgba(...)`, which lightweight-charts handles fine.

### 2. Patch `src/components/charts/Charts.tsx`

In both `EsCandleChart` and `EquityChart`, wrap every `getPropertyValue(...)` with `toRgb(...)`:

```ts
const text = toRgb(styles.getPropertyValue("--foreground"));
const grid = toRgb(styles.getPropertyValue("--grid"));
const bg   = toRgb(styles.getPropertyValue("--card"));
const bull = toRgb(styles.getPropertyValue("--bull"));
const bear = toRgb(styles.getPropertyValue("--bear"));
const info = toRgb(styles.getPropertyValue("--info"));
```

Also replace the hand-rolled `withAlpha` in `EquityChart` (it appends `/ 0.4)` onto an `oklch(...)` string and produces another unparseable value). After `toRgb` we have `rgb(r g b)` and can build `rgba(r,g,b,a)` by parsing the three integers, or simpler: pass two pre-resolved colors — full and transparent — by setting alpha on the probe:

```ts
const infoSolid = toRgb("var(--info)");
const infoFade  = toRgb("color-mix(in srgb, var(--info) 40%, transparent)");
const infoZero  = toRgb("color-mix(in srgb, var(--info) 0%, transparent)");
```

(Or keep it simple: regex `rgb\((\d+),?\s*(\d+),?\s*(\d+)\)` out of `infoSolid` and rebuild `rgba(r,g,b,a)`.)

### 3. Re-mount on theme change

Today the chart only reads tokens once on mount, so toggling dark/light leaves stale colors. Add a `useTheme()` value (or read `document.documentElement.classList.contains('dark')`) into the effect's dep list so it rebuilds on theme switch. Low priority — separate from the blank-chart bug — but worth doing in the same pass.

## Files touched

- **new** `src/lib/color.ts` — `toRgb` helper.
- **edit** `src/components/charts/Charts.tsx` — route every CSS-var read through `toRgb`; fix `withAlpha` in `EquityChart`; add theme dep to effects.

No changes needed to `EsChartPanel`, `TpoProfile` (CSS-only), routes, or mock data. After this, the Plan tab's ES candle chart, the Iron Fly SPX chart, and the Performance equity chart all render.

## Out of scope

- The `oklch` tokens themselves stay — they're correct for the app UI; only the chart needs rgb.
- React #418 should disappear once the chart mounts cleanly. If it lingers, that's a separate SSR mismatch worth a follow-up.
