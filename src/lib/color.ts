// Resolve any CSS color string (oklch, lab, hsl, var(...), named, hex)
// into an rgb()/rgba() string that legacy color parsers (e.g.
// lightweight-charts) can read. Uses the browser's computed-style pass.
export function toRgb(cssColor: string, fallback = "rgb(136, 136, 136)"): string {
  if (typeof document === "undefined") return fallback;
  const probe = document.createElement("span");
  probe.style.color = (cssColor || "").trim() || fallback;
  probe.style.display = "none";
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  return resolved || fallback;
}

/** Build an rgba() string from an already-resolved rgb()/rgba() value. */
export function withAlpha(rgbColor: string, alpha: number): string {
  const m = rgbColor.match(/(\d+(?:\.\d+)?)\s*[, ]\s*(\d+(?:\.\d+)?)\s*[, ]\s*(\d+(?:\.\d+)?)/);
  if (!m) return rgbColor;
  return `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${alpha})`;
}
