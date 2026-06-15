// Normalize any CSS color string (oklch, lab, hsl, var(...), named, hex)
// into a legacy `#rrggbb` / `rgba(...)` value that legacy color parsers
// (e.g. lightweight-charts) accept.
//
// Two-step normalization:
//   1) Resolve CSS variables / custom properties via getComputedStyle on a
//      throwaway probe element.
//   2) Force conversion to legacy hex/rgba by assigning to a Canvas 2D
//      `fillStyle` — the only browser API that always returns sRGB
//      hex/rgba regardless of the source color space (oklch, lab, etc.).
let ctx: CanvasRenderingContext2D | null = null;

export function toRgb(cssColor: string, fallback = "#888888"): string {
  if (typeof document === "undefined") return fallback;
  const input = (cssColor || "").trim() || fallback;

  const probe = document.createElement("span");
  probe.style.color = input;
  probe.style.display = "none";
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color || input;
  probe.remove();

  if (!ctx) ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return fallback;
  try {
    ctx.fillStyle = "#000";
    ctx.fillStyle = resolved;
    const out = ctx.fillStyle as string;
    return out || fallback;
  } catch {
    return fallback;
  }
}

/** Build an rgba() string from a hex or rgb/rgba color. */
export function withAlpha(rgbColor: string, alpha: number): string {
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
