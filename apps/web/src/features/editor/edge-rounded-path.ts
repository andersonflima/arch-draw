import type { ArchitectureEdgePath } from "@arch-draw/domain";
import type { EdgePoint } from "./edge-geometry";
import { segmentIntersectsRect, type EdgeObstacleRect } from "./edge-routing";

const EPSILON = 0.001;
const CURVE_SEGMENTS = 10;

export const buildRoundedPolylinePath = (
  points: readonly EdgePoint[],
  radius: number,
  _path: ArchitectureEdgePath,
  obstacles: readonly EdgeObstacleRect[] = []
): string => {
  if (points.length < 2) return "";
  let path = `M ${points[0]?.x ?? 0} ${points[0]?.y ?? 0}`;
  for (let index = 1; index < points.length; index += 1) {
    const current = points[index];
    if (!current) continue;
    const previous = points[index - 1];
    if (!previous) continue;
    const next = points[index + 1];
    if (!next) {
      path += ` L ${current.x} ${current.y}`;
      continue;
    }

    const corner = getRoundedCorner(previous, current, next, radius, index, points.length);
    if (!corner || doesQuadraticCurveHitObstacle(corner.start, current, corner.end, obstacles)) {
      path += ` L ${current.x} ${current.y}`;
      continue;
    }

    path += ` L ${corner.start.x} ${corner.start.y} Q ${current.x} ${current.y} ${corner.end.x} ${corner.end.y}`;
  }
  return path;
};

const getRoundedCorner = (
  previous: EdgePoint,
  current: EdgePoint,
  next: EdgePoint,
  radius: number,
  index: number,
  pointCount: number
): Readonly<{ start: EdgePoint; end: EdgePoint }> | null => {
  const inDx = current.x - previous.x;
  const inDy = current.y - previous.y;
  const outDx = next.x - current.x;
  const outDy = next.y - current.y;
  const inLength = Math.hypot(inDx, inDy);
  const outLength = Math.hypot(outDx, outDy);
  if (inLength < EPSILON || outLength < EPSILON) return null;

  const inUnitX = inDx / inLength;
  const inUnitY = inDy / inLength;
  const outUnitX = outDx / outLength;
  const outUnitY = outDy / outLength;
  const dot = inUnitX * outUnitX + inUnitY * outUnitY;
  if (Math.abs(Math.abs(dot) - 1) <= 0.02) return null;

  const isEndpointCorner = index === 1 || index === pointCount - 2;
  const endpointCornerRadius = Math.max(4, Math.round(radius * 0.55));
  const allowedRadius = isEndpointCorner ? endpointCornerRadius : radius;
  const cornerRadius = Math.min(allowedRadius, inLength * 0.5, outLength * 0.5);

  return {
    start: {
      x: current.x - inUnitX * cornerRadius,
      y: current.y - inUnitY * cornerRadius
    },
    end: {
      x: current.x + outUnitX * cornerRadius,
      y: current.y + outUnitY * cornerRadius
    }
  };
};

const doesQuadraticCurveHitObstacle = (
  start: EdgePoint,
  control: EdgePoint,
  end: EdgePoint,
  obstacles: readonly EdgeObstacleRect[]
): boolean => {
  if (obstacles.length === 0) return false;
  let previous = start;
  for (let segment = 1; segment <= CURVE_SEGMENTS; segment += 1) {
    const t = segment / CURVE_SEGMENTS;
    const current = getQuadraticPoint(start, control, end, t);
    if (obstacles.some((obstacle) => segmentIntersectsRect(previous, current, obstacle))) {
      return true;
    }
    previous = current;
  }
  return false;
};

const getQuadraticPoint = (
  start: EdgePoint,
  control: EdgePoint,
  end: EdgePoint,
  t: number
): EdgePoint => {
  const inverse = 1 - t;
  return {
    x: inverse * inverse * start.x + 2 * inverse * t * control.x + t * t * end.x,
    y: inverse * inverse * start.y + 2 * inverse * t * control.y + t * t * end.y
  };
};
