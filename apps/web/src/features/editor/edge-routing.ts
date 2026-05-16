import type { EdgePoint } from "./edge-geometry";

export type EdgeObstacleRect = Readonly<{
  id: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
}>;

type EdgeRoutingConfig = Readonly<{
  maxPasses: number;
  obstacleClearance: number;
}>;

export const routePolylineAroundObstacles = (
  points: readonly EdgePoint[],
  obstacles: readonly EdgeObstacleRect[],
  sourceId: string,
  targetId: string,
  config: EdgeRoutingConfig
): readonly EdgePoint[] => {
  let routed = compactPolyline(points);
  if (routed.length < 2 || obstacles.length === 0) return routed;

  let pass = 0;
  while (pass < config.maxPasses) {
    pass += 1;
    let changed = false;

    for (let index = 0; index < routed.length - 1; index += 1) {
      const start = routed[index];
      const end = routed[index + 1];
      if (!start || !end) continue;
      const isFirstSegment = index === 0;
      const isLastSegment = index === routed.length - 2;
      const blocking = obstacles.find((rect) => {
        if (isFirstSegment && rect.id === sourceId) return false;
        if (isLastSegment && rect.id === targetId) return false;
        return segmentIntersectsRect(start, end, rect);
      });
      if (!blocking) continue;
      const detour = buildSegmentDetour(start, end, blocking, obstacles, config.obstacleClearance);
      if (detour.length === 0) continue;
      routed = compactPolyline([
        ...routed.slice(0, index + 1),
        ...detour,
        ...routed.slice(index + 1)
      ]);
      changed = true;
      break;
    }

    if (!changed) break;
  }

  return routed;
};

const buildSegmentDetour = (
  start: EdgePoint,
  end: EdgePoint,
  obstacle: EdgeObstacleRect,
  obstacles: readonly EdgeObstacleRect[],
  clearance: number
): readonly EdgePoint[] => {
  const nearHorizontal = Math.abs(start.y - end.y) <= Math.abs(start.x - end.x);
  const candidates: EdgePoint[][] = [];

  if (nearHorizontal) {
    const topY = obstacle.top - clearance;
    const bottomY = obstacle.bottom + clearance;
    candidates.push(
      [{ x: start.x, y: topY }, { x: end.x, y: topY }],
      [{ x: start.x, y: bottomY }, { x: end.x, y: bottomY }]
    );
  } else {
    const leftX = obstacle.left - clearance;
    const rightX = obstacle.right + clearance;
    candidates.push(
      [{ x: leftX, y: start.y }, { x: leftX, y: end.y }],
      [{ x: rightX, y: start.y }, { x: rightX, y: end.y }]
    );
  }

  candidates.push(
    [{ x: obstacle.left - clearance, y: start.y }, { x: obstacle.left - clearance, y: end.y }],
    [{ x: obstacle.right + clearance, y: start.y }, { x: obstacle.right + clearance, y: end.y }],
    [{ x: start.x, y: obstacle.top - clearance }, { x: end.x, y: obstacle.top - clearance }],
    [{ x: start.x, y: obstacle.bottom + clearance }, { x: end.x, y: obstacle.bottom + clearance }]
  );

  return pickBestDetour(start, end, candidates, obstacles);
};

const pickBestDetour = (
  start: EdgePoint,
  end: EdgePoint,
  candidates: readonly (readonly EdgePoint[])[],
  obstacles: readonly EdgeObstacleRect[]
): readonly EdgePoint[] => {
  let best: readonly EdgePoint[] = [];
  let bestScore = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const path = compactPolyline([start, ...candidate, end]);
    if (path.length < 2) continue;
    const collisions = countPolylineObstacleCollisions(path, obstacles);
    const length = getPolylineLength(path);
    const bends = Math.max(0, path.length - 2);
    const score = collisions * 10000 + length + bends * 10;
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return best;
};

const countPolylineObstacleCollisions = (
  points: readonly EdgePoint[],
  obstacles: readonly EdgeObstacleRect[]
): number => {
  let collisions = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    if (!start || !end) continue;
    for (const obstacle of obstacles) {
      if (segmentIntersectsRect(start, end, obstacle)) collisions += 1;
    }
  }
  return collisions;
};

const getPolylineLength = (points: readonly EdgePoint[]): number => {
  let total = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    if (!start || !end) continue;
    total += Math.hypot(end.x - start.x, end.y - start.y);
  }
  return total;
};

const compactPolyline = (points: readonly EdgePoint[]): readonly EdgePoint[] => {
  const compacted: EdgePoint[] = [];
  for (const point of points) {
    const previous = compacted[compacted.length - 1];
    if (previous && Math.abs(previous.x - point.x) < 0.001 && Math.abs(previous.y - point.y) < 0.001) {
      continue;
    }
    compacted.push(point);
    if (compacted.length < 3) continue;
    const a = compacted[compacted.length - 3];
    const b = compacted[compacted.length - 2];
    const c = compacted[compacted.length - 1];
    if (!a || !b || !c) continue;
    const abX = b.x - a.x;
    const abY = b.y - a.y;
    const bcX = c.x - b.x;
    const bcY = c.y - b.y;
    const cross = abX * bcY - abY * bcX;
    if (Math.abs(cross) <= 0.001) {
      compacted.splice(compacted.length - 2, 1);
    }
  }
  return compacted;
};

export const segmentIntersectsRect = (start: EdgePoint, end: EdgePoint, rect: EdgeObstacleRect): boolean => {
  if (pointInsideRect(start, rect) || pointInsideRect(end, rect)) return true;

  const minX = Math.min(start.x, end.x);
  const maxX = Math.max(start.x, end.x);
  const minY = Math.min(start.y, end.y);
  const maxY = Math.max(start.y, end.y);
  if (maxX < rect.left || minX > rect.right || maxY < rect.top || minY > rect.bottom) return false;

  const topLeft = { x: rect.left, y: rect.top };
  const topRight = { x: rect.right, y: rect.top };
  const bottomRight = { x: rect.right, y: rect.bottom };
  const bottomLeft = { x: rect.left, y: rect.bottom };

  return (
    segmentsIntersect(start, end, topLeft, topRight)
    || segmentsIntersect(start, end, topRight, bottomRight)
    || segmentsIntersect(start, end, bottomRight, bottomLeft)
    || segmentsIntersect(start, end, bottomLeft, topLeft)
  );
};

const pointInsideRect = (point: EdgePoint, rect: EdgeObstacleRect): boolean =>
  point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;

const segmentsIntersect = (a: EdgePoint, b: EdgePoint, c: EdgePoint, d: EdgePoint): boolean => {
  const epsilon = 0.001;
  const orientation = (p: EdgePoint, q: EdgePoint, r: EdgePoint): number =>
    (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
  const onSegment = (p: EdgePoint, q: EdgePoint, r: EdgePoint): boolean =>
    q.x <= Math.max(p.x, r.x) + epsilon
    && q.x + epsilon >= Math.min(p.x, r.x)
    && q.y <= Math.max(p.y, r.y) + epsilon
    && q.y + epsilon >= Math.min(p.y, r.y);

  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);

  if ((o1 > 0 && o2 < 0 || o1 < 0 && o2 > 0) && (o3 > 0 && o4 < 0 || o3 < 0 && o4 > 0)) {
    return true;
  }
  if (Math.abs(o1) <= epsilon && onSegment(a, c, b)) return true;
  if (Math.abs(o2) <= epsilon && onSegment(a, d, b)) return true;
  if (Math.abs(o3) <= epsilon && onSegment(c, a, d)) return true;
  if (Math.abs(o4) <= epsilon && onSegment(c, b, d)) return true;
  return false;
};
