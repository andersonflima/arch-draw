/**
 * Framework-agnostic scene representation consumed by canvas-engine renderers.
 *
 * The scene model is the boundary between the editor's domain/view state and the
 * renderers (DOM for nodes, canvas for edges). It carries absolute world
 * geometry and an explicit paint order so a renderer never has to know about
 * Angular, the DOM, or the hierarchy rules that produced it.
 */

export type SceneLayer = "container" | "leaf";

/** A node resolved to absolute world coordinates and an explicit paint order. */
export interface SceneNode {
  readonly id: string;
  readonly layer: SceneLayer;
  /** Hierarchy depth (0 = root, +1 per container ancestor). */
  readonly depth: number;
  /** Explicit stacking order; higher values paint on top. */
  readonly zOrder: number;
  /** Absolute world position with parent offsets resolved. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface SceneEdge {
  readonly id: string;
  readonly from: string;
  readonly to: string;
}

export interface SceneModel {
  /** Every node in paint order (ascending zOrder, stable by source order). */
  readonly nodes: readonly SceneNode[];
  /** Container nodes only, preserving the paint order of `nodes`. */
  readonly containers: readonly SceneNode[];
  /** Leaf nodes only, preserving the paint order of `nodes`. */
  readonly leaves: readonly SceneNode[];
  readonly edges: readonly SceneEdge[];
}
