import type { ScenePoint } from "./renderer.js";

/**
 * A fully-styled edge ready to be drawn by the canvas edge renderer. The editor
 * resolves routing/colour/markers (reusing its existing geometry) and hands the
 * renderer these flat draw commands, so the renderer stays free of domain logic.
 */
export interface RenderableEdge {
  readonly id: string;
  /** Routed polyline in world coordinates (at least two points). */
  readonly points: readonly ScenePoint[];
  readonly stroke: string;
  /** Stroke width in world units (scales with zoom, matching the SVG layer). */
  readonly lineWidth: number;
  /** Dash pattern in world units; empty means a solid line. */
  readonly dash: readonly number[];
  readonly arrowStart: boolean;
  readonly arrowEnd: boolean;
  /** Corner rounding radius in world units. */
  readonly cornerRadius: number;
  /** 0..1 multiplier for muted/de-emphasised edges. */
  readonly opacity: number;
}

export const isDrawableEdge = (edge: RenderableEdge): boolean => edge.points.length >= 2;
