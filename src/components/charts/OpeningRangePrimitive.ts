// ISeriesPrimitive that renders Opening Range zones on the candlestick series.
// Each zone is a filled rectangle (~15% alpha) with dashed top/bottom borders
// and a left-edge text label.
import type {
  ISeriesPrimitive,
  IPrimitivePaneView,
  IPrimitivePaneRenderer,
  SeriesAttachedParameter,
  Time,
} from "lightweight-charts";
import type { CanvasRenderingTarget2D } from "fancy-canvas";
import type { OpeningRangeZone } from "@/lib/opening-ranges";
import { withAlpha } from "@/lib/color";

interface Ctx {
  chart: SeriesAttachedParameter<Time>["chart"];
  series: SeriesAttachedParameter<Time>["series"];
  requestUpdate?: () => void;
}

class ZoneRenderer implements IPrimitivePaneRenderer {
  constructor(private zones: OpeningRangeZone[], private ctx: Ctx | null) {}

  draw(target: CanvasRenderingTarget2D): void {
    if (!this.ctx) return;
    const { chart, series } = this.ctx;
    const timeScale = chart.timeScale();
    const zones = this.zones;
    if (!zones.length) return;

    target.useMediaCoordinateSpace(({ context: c, mediaSize }) => {
      for (const z of zones) {
        const x1 = timeScale.timeToCoordinate(z.windowStart as Time);
        const x2 = timeScale.timeToCoordinate(z.rightEdge as Time);
        const yHigh = series.priceToCoordinate(z.high);
        const yLow = series.priceToCoordinate(z.low);
        if (x1 == null || x2 == null || yHigh == null || yLow == null) continue;
        const left = Math.min(x1, x2);
        const right = Math.max(x1, x2);
        const top = Math.min(yHigh, yLow);
        const bottom = Math.max(yHigh, yLow);
        if (right < 0 || left > mediaSize.width) continue;

        // Fill
        c.fillStyle = withAlpha(z.color, 0.13);
        c.fillRect(left, top, right - left, bottom - top);

        // Dashed boundary lines
        c.save();
        c.strokeStyle = withAlpha(z.color, 0.9);
        c.lineWidth = 1;
        c.setLineDash([4, 3]);
        c.beginPath();
        c.moveTo(left, top + 0.5);
        c.lineTo(right, top + 0.5);
        c.moveTo(left, bottom - 0.5);
        c.lineTo(right, bottom - 0.5);
        c.stroke();
        c.restore();

        // Label
        c.save();
        c.font = "10px JetBrains Mono, ui-monospace, monospace";
        c.fillStyle = withAlpha(z.color, 0.95);
        c.textBaseline = "top";
        const labelX = Math.max(left + 3, 3);
        c.fillText(z.label, labelX, top + 2);
        c.restore();
      }
    });
  }
}

class ZonePaneView implements IPrimitivePaneView {
  constructor(private primitive: OpeningRangePrimitive) {}
  renderer(): IPrimitivePaneRenderer | null {
    return new ZoneRenderer(this.primitive.zones, this.primitive.ctx);
  }
}

export class OpeningRangePrimitive implements ISeriesPrimitive<Time> {
  zones: OpeningRangeZone[] = [];
  ctx: Ctx | null = null;
  private _views: ZonePaneView[];

  constructor() {
    this._views = [new ZonePaneView(this)];
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
    // no-op; renderer reads latest zones each draw.
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return this._views;
  }

  setZones(zones: OpeningRangeZone[]): void {
    this.zones = zones;
    this.ctx?.requestUpdate?.();
  }
}
