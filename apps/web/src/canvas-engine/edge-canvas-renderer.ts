import type { Camera, ScenePoint } from "./renderer.js";
import type { RenderableEdge } from "./edge-render-model.js";
import { isDrawableEdge } from "./edge-render-model.js";
import { computeArrowHead, edgeArrowAnchors, type ArrowHead } from "./edge-canvas-geometry.js";

export interface EdgeCanvasFrame {
  readonly edges: readonly RenderableEdge[];
  readonly camera: Camera;
  /** CSS pixel size of the canvas element. */
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly devicePixelRatio: number;
}

const ARROW_SIZE = 12;

/**
 * Draws the edge layer onto a screen-space `<canvas>`. The renderer applies the
 * camera transform itself and redraws every frame, so lines stay crisp at any
 * zoom (no CSS-transform raster blur) and paint order is trivially correct: the
 * whole layer sits below the DOM node layer.
 */
export class EdgeCanvasRenderer {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;

  mount(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
  }

  render(frame: EdgeCanvasFrame): void {
    const ctx = this.ctx;
    const canvas = this.canvas;
    if (!ctx || !canvas) return;

    const dpr = Math.max(1, frame.devicePixelRatio || 1);
    const backingWidth = Math.max(1, Math.round(frame.cssWidth * dpr));
    const backingHeight = Math.max(1, Math.round(frame.cssHeight * dpr));
    if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
      canvas.width = backingWidth;
      canvas.height = backingHeight;
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, backingWidth, backingHeight);
    // World -> screen: pan + world * zoom, then device-pixel scaling.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.translate(frame.camera.panX, frame.camera.panY);
    ctx.scale(frame.camera.zoom, frame.camera.zoom);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    for (const edge of frame.edges) {
      if (isDrawableEdge(edge)) this.drawEdge(ctx, edge);
    }
  }

  dispose(): void {
    this.canvas = null;
    this.ctx = null;
  }

  private drawEdge(ctx: CanvasRenderingContext2D, edge: RenderableEdge): void {
    ctx.save();
    ctx.globalAlpha = edge.opacity;
    ctx.strokeStyle = edge.stroke;
    ctx.fillStyle = edge.stroke;
    ctx.lineWidth = edge.lineWidth;
    ctx.setLineDash(edge.dash.length > 0 ? [...edge.dash] : []);
    this.tracePath(ctx, edge.points, edge.cornerRadius);
    ctx.stroke();
    ctx.setLineDash([]);
    this.drawArrows(ctx, edge);
    ctx.restore();
  }

  private tracePath(
    ctx: CanvasRenderingContext2D,
    points: readonly ScenePoint[],
    radius: number
  ): void {
    const first = points[0];
    if (!first) return;
    ctx.beginPath();
    ctx.moveTo(first.x, first.y);

    if (radius <= 0 || points.length < 3) {
      for (let i = 1; i < points.length; i += 1) {
        const point = points[i]!;
        ctx.lineTo(point.x, point.y);
      }
      return;
    }

    for (let i = 1; i < points.length - 1; i += 1) {
      const corner = points[i]!;
      const next = points[i + 1]!;
      ctx.arcTo(corner.x, corner.y, next.x, next.y, radius);
    }
    const last = points[points.length - 1]!;
    ctx.lineTo(last.x, last.y);
  }

  private drawArrows(ctx: CanvasRenderingContext2D, edge: RenderableEdge): void {
    const anchors = edgeArrowAnchors(edge.points);
    if (!anchors) return;
    if (edge.arrowEnd) {
      const head = computeArrowHead(anchors.endTip, anchors.endFrom, ARROW_SIZE);
      if (head) this.fillTriangle(ctx, head);
    }
    if (edge.arrowStart) {
      const head = computeArrowHead(anchors.startTip, anchors.startFrom, ARROW_SIZE);
      if (head) this.fillTriangle(ctx, head);
    }
  }

  private fillTriangle(ctx: CanvasRenderingContext2D, head: ArrowHead): void {
    ctx.beginPath();
    ctx.moveTo(head.tip.x, head.tip.y);
    ctx.lineTo(head.left.x, head.left.y);
    ctx.lineTo(head.right.x, head.right.y);
    ctx.closePath();
    ctx.fill();
  }
}
