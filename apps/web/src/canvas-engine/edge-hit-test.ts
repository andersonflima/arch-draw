import type { ScenePoint } from "./renderer.js";
import type { RenderableEdge } from "./edge-render-model.js";

/** Shortest distance from a point to a line segment. */
export const distanceToSegment = (
  point: ScenePoint,
  a: ScenePoint,
  b: ScenePoint
): number => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.x - a.x, point.y - a.y);

  let t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
};

/**
 * Resolve the topmost edge within `threshold` world units of a point, or null.
 * Edges are tested in paint order and the *last* qualifying match wins, so the
 * edge drawn on top (later) is preferred when several overlap.
 */
export const hitTestEdges = (
  edges: readonly RenderableEdge[],
  point: ScenePoint,
  threshold: number
): string | null => {
  let hit: string | null = null;
  let bestDistance = threshold;

  for (const edge of edges) {
    for (let i = 1; i < edge.points.length; i += 1) {
      const distance = distanceToSegment(point, edge.points[i - 1]!, edge.points[i]!);
      if (distance <= bestDistance) {
        bestDistance = distance;
        hit = edge.id;
      }
    }
  }

  return hit;
};
