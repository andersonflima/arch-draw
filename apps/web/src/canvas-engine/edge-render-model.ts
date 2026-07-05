import type { ScenePoint } from "./renderer.js";

/** A centred edge label drawn as a rounded box with text, on top of the wires. */
export interface RenderableEdgeLabel {
  readonly text: string;
  /** World-space centre of the label. */
  readonly x: number;
  readonly y: number;
  readonly fontSize: number;
  readonly color: string;
  readonly background: string;
}

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
  /** Optional label drawn on top of all wires. */
  readonly label?: RenderableEdgeLabel;
}

export const isDrawableEdge = (edge: RenderableEdge): boolean => edge.points.length >= 2;
