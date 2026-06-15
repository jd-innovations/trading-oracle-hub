// ISeriesPrimitive that renders RTH profile levels as horizontal rays
// (POC / VAH / VAL / singles / poor H-L / 30m POCs) with right-edge labels.
import type {
  ISeriesPrimitive,
  IPrimitivePaneView,
  IPrimitivePaneRenderer,
  SeriesAttachedParameter,
  Time,
} from "lightweight-charts";
import type { CanvasRenderingTarget2D } from "fancy-canvas";
import type { ProfileLevel } from "@/lib/profile-levels";
import { withAlpha } from "@/lib/color";

interface Ctx {
  chart: SeriesAttachedParameter<Time>["chart"];
  series: SeriesAttachedParameter<Time>["series"];
  requestUpdate?: () => void;
}

class LevelRenderer implements IPrimitivePaneRenderer {
  constructor(private levels: ProfileLevel[], private ctx: Ctx | null) {}

  draw(target: CanvasRenderingTarget2D): void {
    if (!this.ctx) return;
    const { chart, series } = this.ctx;
    const ts = chart.timeScale();
    const levels = this.levels;
    if (!levels.length) return;

    target.useMediaCoordinateSpace(({ context: c, mediaSize }) => {
      // Track placed labels per row to avoid stacking on top of each other.
      const placed: Array<{ x: number; y: number; w: number; h: number }> = [];

      for (const lvl of levels) {
        const y = series.priceToCoordinate(lvl.price);
        const x1 = ts.timeToCoordinate(lvl.startTime as Time);
        const x2 = ts.timeToCoordinate(lvl.endTime as Time);
        if (y == null) continue;
        if (x1 == null && x2 == null) continue;
        const left = x1 ?? 0;
        const right = x2 ?? mediaSize.width;
        if (right < 0 || left > mediaSize.width) continue;
        const clippedLeft = Math.max(0, left);
        const clippedRight = Math.min(mediaSize.width, right);

        const dim = lvl.broken;
        const alpha = dim ? 0.45 : 0.95;

        // Line
        c.save();
        c.strokeStyle = withAlpha(lvl.color, alpha);
        c.lineWidth = lvl.weight;
        if (lvl.kind === "single" || lvl.kind === "poc30m") {
          c.setLineDash([3, 3]);
        } else if (lvl.kind === "poorHigh" || lvl.kind === "poorLow") {
          c.setLineDash([6, 2]);
        } else {
          c.setLineDash([]);
        }
        c.beginPath();
        c.moveTo(clippedLeft, y + 0.5);
        c.lineTo(clippedRight, y + 0.5);
        c.stroke();
        c.restore();

        // Label at the right end (or near right edge of viewport)
        const labelText = lvl.label;
        c.save();
        c.font = "10px JetBrains Mono, ui-monospace, monospace";
        const metrics = c.measureText(labelText);
        const padX = 4;
        const padY = 2;
        const w = metrics.width + padX * 2;
        const h = 13;
        // Anchor label to the right edge of the ray (clipped to viewport).
        let labelX = clippedRight - w - 2;
        if (labelX < clippedLeft + 2) labelX = clippedLeft + 2;
        let labelY = y - h / 2;

        // Nudge if overlapping a previously placed label.
        let attempts = 0;
        while (
          placed.some(
            (p) =>
              labelX < p.x + p.w &&
              labelX + w > p.x &&
              labelY < p.y + p.h &&
              labelY + h > p.y,
          ) &&
          attempts < 6
        ) {
          labelY += h + 1;
          attempts++;
        }

        c.fillStyle = withAlpha(lvl.color, dim ? 0.18 : 0.85);
        c.fillRect(labelX, labelY, w, h);
        c.fillStyle = "rgba(10,10,10,0.95)";
        c.textBaseline = "middle";
        c.fillText(labelText, labelX + padX, labelY + h / 2);
        c.restore();

        placed.push({ x: labelX, y: labelY, w, h });
      }
    });
  }
}

class LevelPaneView implements IPrimitivePaneView {
  constructor(private primitive: ProfileLevelsPrimitive) {}
  renderer(): IPrimitivePaneRenderer | null {
    return new LevelRenderer(this.primitive.levels, this.primitive.ctx);
  }
}

export class ProfileLevelsPrimitive implements ISeriesPrimitive<Time> {
  levels: ProfileLevel[] = [];
  ctx: Ctx | null = null;
  private _views: LevelPaneView[];

  constructor() {
    this._views = [new LevelPaneView(this)];
  }

  attached(param: SeriesAttachedParameter<Time>): void {
    this.ctx = {
      chart: param.chart,
      series: param.series,
      requestUpdate: param.requestUpdate,
    };
  }

  detached(): void {
    this.ctx = null;
  }

  updateAllViews(): void {
    // no-op
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return this._views;
  }

  setLevels(levels: ProfileLevel[]): void {
    this.levels = levels;
    this.ctx?.requestUpdate?.();
  }
}
