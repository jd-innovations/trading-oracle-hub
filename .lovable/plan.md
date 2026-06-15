# Why charts are still blank

The data is fine — ES mock candles are there. The crash is still a color-parse error inside `lightweight-charts`:

```
Failed to parse color: lab(93.0481 -0.822932 -1.65209)
  at AttributionLogoWidget…
```

Our `toRgb()` helper uses `getComputedStyle(probe).color` to normalize colors. In current Chrome, when the input is `oklch(...)`, the computed value comes back as `lab(...)` (same color space family, not `rgb()`). lightweight-charts' parser only accepts hex / `rgb()` / `rgba()` / named — `lab()` throws, the chart never mounts, and you see a blank box. So switching to SPX or dummy data won't help; the same colors would still crash the chart.

## Fix

Swap the normalization technique. The Canvas 2D context's `fillStyle` setter is the only browser API that *always* returns a legacy `#rrggbb` / `rgba(...)` string regardless of input color space.

### 1. Rewrite `src/lib/color.ts`

```ts
let ctx: CanvasRenderingContext2D | null = null;

export function toRgb(cssColor: string, fallback = "#888888"): string {
  if (typeof document === "undefined") return fallback;
  const input = (cssColor || "").trim() || fallback;

  // Resolve CSS vars / oklch / lab against the document first.
  const probe = document.createElement("span");
  probe.style.color = input;
  probe.style.display = "none";
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color || input;
  probe.remove();

  // Canvas fillStyle forces legacy hex/rgba, which lightweight-charts accepts.
  if (!ctx) ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return fallback;
  try {
    ctx.fillStyle = "#000";       // reset
    ctx.fillStyle = resolved;     // browser converts; rejects invalid silently
    const out = ctx.fillStyle as string;
    return out || fallback;
  } catch {
    return fallback;
  }
}

export function withAlpha(rgbColor: string, alpha: number): string {
  // Accept "#rrggbb", "#rgb", "rgb(...)", "rgba(...)"
  if (rgbColor.startsWith("#")) {
    const hex = rgbColor.slice(1);
    const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  const m = rgbColor.match(/(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)/);
  if (!m) return rgbColor;
  return `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${alpha})`;
}
```

That single change unblocks both `EsCandleChart` and `EquityChart` — no changes needed in `Charts.tsx`, `EsChartPanel`, mock data, or routes.

### 2. Address the secondary hydration warning

The `TpoProfile` row uses `Math.random()`-ish derived values that differ between server prerender and client mount, producing the `6,090.75` vs `6,090.00` mismatch shown in the console. This is unrelated to the blank-chart bug but worth flagging — fix in a follow-up by either:
- generating the TPO data deterministically (seeded), or
- gating `<TpoProfile compact />` with a client-only mount guard.

Not part of this plan unless you want it bundled.

## Files touched

- **edit** `src/lib/color.ts` — canvas-based `toRgb`, robust `withAlpha`.

## Out of scope

- Theme tokens stay in `oklch` — they're correct for the UI.
- No data source change (ES mock stays). Once colors parse, the existing ES candles render.
