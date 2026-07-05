import type { ScenePoint } from "./renderer.js";

export interface ArrowHead {
  readonly tip: ScenePoint;
  readonly left: ScenePoint;
  readonly right: ScenePoint;
}

/**
 * Compute the two base corners of an arrowhead triangle whose tip is at `tip`
 * and which points along the direction coming from `from`. Returns null when the
 * segment is degenerate (from == tip), so the caller can skip the marker.
 */
export const computeArrowHead = (
  tip: ScenePoint,
  from: ScenePoint,
  size: number,
  spread = Math.PI / 7
): ArrowHead | null => {
  const dx = tip.x - from.x;
  const dy = tip.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length < 1e-6) return null;

  const heading = Math.atan2(dy, dx);
  const back = heading + Math.PI;
  return {
    tip,
    left: {
      x: tip.x + size * Math.cos(back - spread),
      y: tip.y + size * Math.sin(back - spread)
    },
    right: {
      x: tip.x + size * Math.cos(back + spread),
      y: tip.y + size * Math.sin(back + spread)
    }
  };
};

/** Sample a cubic Bézier into a polyline of `segments + 1` points. Used to draw
 * the curved connection-drag preview on the canvas. */
export const sampleCubicBezier = (
  p0: ScenePoint,
  p1: ScenePoint,
  p2: ScenePoint,
  p3: ScenePoint,
  segments: number
): ScenePoint[] => {
  const steps = Math.max(1, Math.floor(segments));
  const points: ScenePoint[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const u = 1 - t;
    const a = u * u * u;
    const b = 3 * u * u * t;
    const c = 3 * u * t * t;
    const d = t * t * t;
    points.push({
      x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
      y: a * p0.y + b * p1.y + c * p2.y + d * p3.y
    });
  }
  return points;
};

/** Direction reference points for the end/start markers of a polyline. */
export const edgeArrowAnchors = (
  points: readonly ScenePoint[]
): { readonly endTip: ScenePoint; readonly endFrom: ScenePoint; readonly startTip: ScenePoint; readonly startFrom: ScenePoint } | null => {
  if (points.length < 2) return null;
  return {
    endTip: points[points.length - 1]!,
    endFrom: points[points.length - 2]!,
    startTip: points[0]!,
    startFrom: points[1]!
  };
};
