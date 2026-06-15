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

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

function to255(n: number) {
  return Math.round(clamp01(n) * 255);
}

function legacyRgb(r: number, g: number, b: number, alpha?: number) {
  const rgb = `${to255(r)}, ${to255(g)}, ${to255(b)}`;
  return alpha === undefined || alpha >= 1 ? `rgb(${rgb})` : `rgba(${rgb}, ${alpha})`;
}

function labToRgb(color: string) {
  const match = color.match(/lab\(\s*([+-]?[\d.]+)%?\s+([+-]?[\d.]+)\s+([+-]?[\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)/i);
  if (!match) return null;

  const l = Number(match[1]);
  const a = Number(match[2]);
  const b = Number(match[3]);
  const alpha = match[4]?.endsWith("%") ? Number(match[4].slice(0, -1)) / 100 : match[4] ? Number(match[4]) : undefined;

  const fy = (l + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const epsilon = 216 / 24389;
  const kappa = 24389 / 27;
  const fInv = (t: number) => {
    const t3 = t ** 3;
    return t3 > epsilon ? t3 : (116 * t - 16) / kappa;
  };

  let x = 0.96422 * fInv(fx);
  let y = 1 * fInv(fy);
  let z = 0.82521 * fInv(fz);

  // D50 -> D65 chromatic adaptation, then XYZ -> linear sRGB.
  const xD65 = 0.9555766 * x - 0.0230393 * y + 0.0631636 * z;
  const yD65 = -0.0282895 * x + 1.0099416 * y + 0.0210077 * z;
  const zD65 = 0.0122982 * x - 0.020483 * y + 1.3299098 * z;
  x = xD65;
  y = yD65;
  z = zD65;

  const linear = [
    3.2404542 * x - 1.5371385 * y - 0.4985314 * z,
    -0.969266 * x + 1.8760108 * y + 0.041556 * z,
    0.0556434 * x - 0.2040259 * y + 1.0572252 * z,
  ];
  const srgb = linear.map((v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055));
  return legacyRgb(srgb[0], srgb[1], srgb[2], alpha);
}

function oklchToRgb(color: string) {
  const match = color.match(/oklch\(\s*([+-]?[\d.]+)%?\s+([+-]?[\d.]+)\s+([+-]?[\d.]+)(?:deg)?(?:\s*\/\s*([\d.]+%?))?\s*\)/i);
  if (!match) return null;

  const rawL = Number(match[1]);
  const l = rawL > 1 ? rawL / 100 : rawL;
  const c = Number(match[2]);
  const h = (Number(match[3]) * Math.PI) / 180;
  const alpha = match[4]?.endsWith("%") ? Number(match[4].slice(0, -1)) / 100 : match[4] ? Number(match[4]) : undefined;
  const a = Math.cos(h) * c;
  const b = Math.sin(h) * c;

  const lPrime = l + 0.3963377774 * a + 0.2158037573 * b;
  const mPrime = l - 0.1055613458 * a - 0.0638541728 * b;
  const sPrime = l - 0.0894841775 * a - 1.291485548 * b;
  const lms = [lPrime ** 3, mPrime ** 3, sPrime ** 3];
  const rgb = [
    4.0767416621 * lms[0] - 3.3077115913 * lms[1] + 0.2309699292 * lms[2],
    -1.2684380046 * lms[0] + 2.6097574011 * lms[1] - 0.3413193965 * lms[2],
    -0.0041960863 * lms[0] - 0.7034186147 * lms[1] + 1.707614701 * lms[2],
  ].map((v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055));

  return legacyRgb(rgb[0], rgb[1], rgb[2], alpha);
}

export function toRgb(cssColor: string, fallback = "#888888"): string {
  if (typeof document === "undefined") return fallback;
  const input = (cssColor || "").trim() || fallback;
  const direct = labToRgb(input) || oklchToRgb(input);
  if (direct) return direct;

  const probe = document.createElement("span");
  probe.style.color = input;
  probe.style.display = "none";
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color || input;
  probe.remove();
  const converted = labToRgb(resolved) || oklchToRgb(resolved);
  if (converted) return converted;

  if (!ctx) ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return fallback;
  try {
    ctx.fillStyle = "#000";
    ctx.fillStyle = resolved;
    const out = ctx.fillStyle as string;
    return out && !/^(lab|oklch|oklab|lch)\(/i.test(out) ? out : fallback;
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
