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

type GraphNode = Readonly<{
  key: string;
  point: EdgePoint;
}>;

type GraphEdge = Readonly<{
  to: string;
  cost: number;
}>;

type GraphDirection = "horizontal" | "vertical" | "start";

const EPSILON = 0.001;
const MAX_AXIS_VALUES = 84;
const DENSE_OBSTACLE_AXIS_VALUES = 40;
const MID_OBSTACLE_AXIS_VALUES = 56;
const MAX_OBSTACLES_FOR_ASTAR = 28;
const BEND_COST = 10000;
const MAX_OPERATIONS_PER_PASS_MULTIPLIER = 8;

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
    let operations = 0;
    const maxOperations = Math.max(
      config.maxPasses,
      obstacles.length * MAX_OPERATIONS_PER_PASS_MULTIPLIER
    );

    let index = 0;
    while (index < routed.length - 1 && operations < maxOperations) {
      const start = routed[index];
      const end = routed[index + 1];
      if (!start || !end) {
        index += 1;
        continue;
      }

      const isFirstSegment = index === 0;
      const isLastSegment = index === routed.length - 2;
      const segmentObstacles = getSegmentObstacles(obstacles, sourceId, targetId, isFirstSegment, isLastSegment);
      const blocking = segmentObstacles.find((rect) => segmentIntersectsRect(start, end, rect));
      if (!blocking) {
        index += 1;
        continue;
      }

      const astarPath = routeSegmentWithAStar(start, end, segmentObstacles, config.obstacleClearance);
      const detour = astarPath
        ? astarPath.slice(1, Math.max(1, astarPath.length - 1))
        : buildSegmentDetour(start, end, blocking, segmentObstacles, config.obstacleClearance);

      if (detour.length === 0) {
        index += 1;
        continue;
      }

      routed = compactPolyline([
        ...routed.slice(0, index + 1),
        ...detour,
        ...routed.slice(index + 1)
      ]);
      changed = true;
      operations += 1;
      index = Math.max(0, index - 1);
      continue;
    }

    if (!changed) break;
  }

  return routed;
};

const getSegmentObstacles = (
  obstacles: readonly EdgeObstacleRect[],
  sourceId: string,
  targetId: string,
  isFirstSegment: boolean,
  isLastSegment: boolean
): readonly EdgeObstacleRect[] =>
  obstacles.filter((rect) => {
    // Terminal segments can ignore only the padded endpoint rect (`sourceId` / `targetId`)
    // so the line can leave/enter naturally, but hard/icon endpoint rects must still block
    // to prevent routes crossing through the element body at any point.
    if (isFirstSegment && rect.id === sourceId) return false;
    if (isLastSegment && rect.id === targetId) return false;
    if (isFirstSegment && isEndpointOwnedObstacle(rect, sourceId)) return false;
    if (isLastSegment && isEndpointOwnedObstacle(rect, targetId)) return false;
    if (isFirstSegment && isEndpointContactShield(rect, sourceId)) return false;
    if (isLastSegment && isEndpointContactShield(rect, targetId)) return false;
    return true;
  });

const isEndpointContactShield = (rect: EdgeObstacleRect, nodeId: string): boolean =>
  rect.id === `${nodeId}__contact-shield`;

const isEndpointOwnedObstacle = (rect: EdgeObstacleRect, nodeId: string): boolean =>
  rect.id === `${nodeId}__hard`
  || rect.id === `${nodeId}__icon`;

const routeSegmentWithAStar = (
  start: EdgePoint,
  end: EdgePoint,
  obstacles: readonly EdgeObstacleRect[],
  clearance: number
): readonly EdgePoint[] | null => {
  if (obstacles.length > MAX_OBSTACLES_FOR_ASTAR) return null;
  const graph = buildOrthogonalVisibilityGraph(start, end, obstacles, clearance);
  if (!graph) return null;

  const pathKeys = searchLowestBendPath(graph.nodesByKey, graph.edgesByKey, graph.startKey, graph.endKey);
  if (!pathKeys) return null;

  return compactPolyline(
    pathKeys
      .map((key) => graph.nodesByKey.get(key)?.point)
      .filter((point): point is EdgePoint => Boolean(point))
  );
};

const buildOrthogonalVisibilityGraph = (
  start: EdgePoint,
  end: EdgePoint,
  obstacles: readonly EdgeObstacleRect[],
  clearance: number
): Readonly<{
  startKey: string;
  endKey: string;
  nodesByKey: ReadonlyMap<string, GraphNode>;
  edgesByKey: ReadonlyMap<string, readonly GraphEdge[]>;
}> | null => {
  const requiredX = new Set<number>([start.x, end.x]);
  const requiredY = new Set<number>([start.y, end.y]);

  const xCandidates = new Set<number>([start.x, end.x]);
  const yCandidates = new Set<number>([start.y, end.y]);

  for (const obstacle of obstacles) {
    xCandidates.add(obstacle.left - clearance);
    xCandidates.add(obstacle.right + clearance);

    yCandidates.add(obstacle.top - clearance);
    yCandidates.add(obstacle.bottom + clearance);
  }

  const axisBudget = obstacles.length > MAX_OBSTACLES_FOR_ASTAR
    ? DENSE_OBSTACLE_AXIS_VALUES
    : obstacles.length > Math.floor(MAX_OBSTACLES_FOR_ASTAR / 2)
      ? MID_OBSTACLE_AXIS_VALUES
      : MAX_AXIS_VALUES;
  const xs = reduceAxisValues([...xCandidates].sort((left, right) => left - right), requiredX, axisBudget);
  const ys = reduceAxisValues([...yCandidates].sort((left, right) => left - right), requiredY, axisBudget);

  const nodesByKey = new Map<string, GraphNode>();

  for (const x of xs) {
    for (const y of ys) {
      const point = { x, y };
      if (isPointInsideObstacleInterior(point, obstacles)) continue;
      const key = toKey(point);
      nodesByKey.set(key, { key, point });
    }
  }

  const startKey = toKey(start);
  const endKey = toKey(end);
  if (!nodesByKey.has(startKey) || !nodesByKey.has(endKey)) return null;

  const edgesByKey = new Map<string, GraphEdge[]>();
  for (const key of nodesByKey.keys()) {
    edgesByKey.set(key, []);
  }

  for (const y of ys) {
    const row = xs
      .map((x) => nodesByKey.get(toKey({ x, y })))
      .filter((node): node is GraphNode => Boolean(node));
    connectAdjacentNodes(row, edgesByKey, obstacles);
  }

  for (const x of xs) {
    const column = ys
      .map((y) => nodesByKey.get(toKey({ x, y })))
      .filter((node): node is GraphNode => Boolean(node));
    connectAdjacentNodes(column, edgesByKey, obstacles);
  }

  return {
    startKey,
    endKey,
    nodesByKey,
    edgesByKey
  };
};

const reduceAxisValues = (
  values: readonly number[],
  required: ReadonlySet<number>,
  maxValues: number
): readonly number[] => {
  if (values.length <= maxValues) return values;

  const uniqueValues = [...new Set(values)];
  const selected = new Set<number>([...required]);
  selected.add(uniqueValues[0] ?? 0);
  selected.add(uniqueValues[uniqueValues.length - 1] ?? 0);

  if (selected.size >= maxValues) {
    return [...selected].sort((left, right) => left - right);
  }

  const availableSlots = maxValues - selected.size;
  const step = Math.max(1, Math.floor(uniqueValues.length / Math.max(1, availableSlots)));
  for (let index = 0; index < uniqueValues.length && selected.size < maxValues; index += step) {
    selected.add(uniqueValues[index] ?? 0);
  }

  return [...selected].sort((left, right) => left - right);
};

const connectAdjacentNodes = (
  nodes: readonly GraphNode[],
  edgesByKey: Map<string, GraphEdge[]>,
  obstacles: readonly EdgeObstacleRect[]
): void => {
  for (let index = 0; index < nodes.length - 1; index += 1) {
    const left = nodes[index];
    const right = nodes[index + 1];
    if (!left || !right) continue;

    if (!isOrthogonalSegmentClear(left.point, right.point, obstacles)) continue;

    const cost = Math.hypot(right.point.x - left.point.x, right.point.y - left.point.y);
    edgesByKey.get(left.key)?.push({ to: right.key, cost });
    edgesByKey.get(right.key)?.push({ to: left.key, cost });
  }
};

const isOrthogonalSegmentClear = (
  start: EdgePoint,
  end: EdgePoint,
  obstacles: readonly EdgeObstacleRect[]
): boolean => {
  for (const obstacle of obstacles) {
    if (orthogonalSegmentCrossesObstacleInterior(start, end, obstacle)) return false;
  }
  return true;
};

const orthogonalSegmentCrossesObstacleInterior = (
  start: EdgePoint,
  end: EdgePoint,
  rect: EdgeObstacleRect
): boolean => {
  if (isStrictObstacle(rect)) {
    // Contact-area obstacles are strict: any contact is treated as collision.
    return segmentIntersectsRect(start, end, rect);
  }

  if (Math.abs(start.x - end.x) <= EPSILON) {
    const x = start.x;
    if (!(x > rect.left + EPSILON && x < rect.right - EPSILON)) return false;

    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);
    const overlap = Math.min(maxY, rect.bottom - EPSILON) - Math.max(minY, rect.top + EPSILON);
    return overlap > EPSILON;
  }

  if (Math.abs(start.y - end.y) <= EPSILON) {
    const y = start.y;
    if (!(y > rect.top + EPSILON && y < rect.bottom - EPSILON)) return false;

    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    const overlap = Math.min(maxX, rect.right - EPSILON) - Math.max(minX, rect.left + EPSILON);
    return overlap > EPSILON;
  }

  return segmentIntersectsRect(start, end, rect);
};

const searchLowestBendPath = (
  nodesByKey: ReadonlyMap<string, GraphNode>,
  edgesByKey: ReadonlyMap<string, readonly GraphEdge[]>,
  startKey: string,
  endKey: string
): readonly string[] | null => {
  const startState = toStateKey(startKey, "start");
  const open = new Set<string>([startState]);
  const cameFrom = new Map<string, string>();
  const gScore = new Map<string, number>([[startState, 0]]);
  const fScore = new Map<string, number>([[startState, heuristic(nodesByKey, startKey, endKey)]]);

  while (open.size > 0) {
    const current = getLowestScoreKey(open, fScore);
    if (!current) break;
    const currentState = fromStateKey(current);
    if (currentState.nodeKey === endKey) {
      return compactPathKeys(reconstructStatePath(cameFrom, current).map((key) => fromStateKey(key).nodeKey));
    }

    open.delete(current);

    const currentNode = nodesByKey.get(currentState.nodeKey);
    if (!currentNode) continue;

    const neighbors = edgesByKey.get(currentState.nodeKey) ?? [];
    for (const neighbor of neighbors) {
      const neighborNode = nodesByKey.get(neighbor.to);
      if (!neighborNode) continue;
      const direction = getSegmentDirection(currentNode.point, neighborNode.point);
      const turnCost = currentState.direction !== "start" && currentState.direction !== direction
        ? BEND_COST
        : 0;
      const neighborState = toStateKey(neighbor.to, direction);
      const tentativeG = (gScore.get(current) ?? Number.POSITIVE_INFINITY) + neighbor.cost + turnCost;
      if (tentativeG >= (gScore.get(neighborState) ?? Number.POSITIVE_INFINITY)) continue;

      cameFrom.set(neighborState, current);
      gScore.set(neighborState, tentativeG);
      fScore.set(neighborState, tentativeG + heuristic(nodesByKey, neighbor.to, endKey));
      open.add(neighborState);
    }
  }

  return null;
};

const getSegmentDirection = (start: EdgePoint, end: EdgePoint): Exclude<GraphDirection, "start"> =>
  Math.abs(start.x - end.x) >= Math.abs(start.y - end.y) ? "horizontal" : "vertical";

const toStateKey = (nodeKey: string, direction: GraphDirection): string => `${nodeKey}|${direction}`;

const fromStateKey = (stateKey: string): Readonly<{ nodeKey: string; direction: GraphDirection }> => {
  const separatorIndex = stateKey.lastIndexOf("|");
  const nodeKey = separatorIndex >= 0 ? stateKey.slice(0, separatorIndex) : stateKey;
  const direction = separatorIndex >= 0 ? stateKey.slice(separatorIndex + 1) : "start";
  return {
    nodeKey,
    direction: direction === "horizontal" || direction === "vertical" ? direction : "start"
  };
};

const compactPathKeys = (keys: readonly string[]): readonly string[] => {
  const compacted: string[] = [];
  for (const key of keys) {
    if (compacted[compacted.length - 1] === key) continue;
    compacted.push(key);
  }
  return compacted;
};

const heuristic = (
  nodesByKey: ReadonlyMap<string, GraphNode>,
  fromKey: string,
  toKey: string
): number => {
  const from = nodesByKey.get(fromKey)?.point;
  const to = nodesByKey.get(toKey)?.point;
  if (!from || !to) return Number.POSITIVE_INFINITY;
  return Math.abs(from.x - to.x) + Math.abs(from.y - to.y);
};

const getLowestScoreKey = (open: ReadonlySet<string>, fScore: ReadonlyMap<string, number>): string | null => {
  let bestKey: string | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const candidate of open) {
    const score = fScore.get(candidate) ?? Number.POSITIVE_INFINITY;
    if (score < bestScore) {
      bestScore = score;
      bestKey = candidate;
    }
  }

  return bestKey;
};

const reconstructStatePath = (cameFrom: ReadonlyMap<string, string>, current: string): readonly string[] => {
  const path = [current];
  let cursor = current;
  while (cameFrom.has(cursor)) {
    cursor = cameFrom.get(cursor) ?? cursor;
    path.unshift(cursor);
  }
  return path;
};

const isPointInsideObstacleInterior = (point: EdgePoint, obstacles: readonly EdgeObstacleRect[]): boolean =>
  obstacles.some((obstacle) =>
    isStrictObstacle(obstacle)
      ? (
        point.x >= obstacle.left - EPSILON
        && point.x <= obstacle.right + EPSILON
        && point.y >= obstacle.top - EPSILON
        && point.y <= obstacle.bottom + EPSILON
      )
      : (
        point.x > obstacle.left + EPSILON
        && point.x < obstacle.right - EPSILON
        && point.y > obstacle.top + EPSILON
        && point.y < obstacle.bottom - EPSILON
      )
  );

const toKey = (point: EdgePoint): string => `${point.x}:${point.y}`;

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
    if (previous && Math.abs(previous.x - point.x) < EPSILON && Math.abs(previous.y - point.y) < EPSILON) {
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
    if (Math.abs(cross) <= EPSILON) {
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

const isStrictObstacle = (rect: EdgeObstacleRect): boolean =>
  rect.id.endsWith("__icon") || rect.id.endsWith("__contact-shield");

const segmentsIntersect = (a: EdgePoint, b: EdgePoint, c: EdgePoint, d: EdgePoint): boolean => {
  const orientation = (p: EdgePoint, q: EdgePoint, r: EdgePoint): number =>
    (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
  const onSegment = (p: EdgePoint, q: EdgePoint, r: EdgePoint): boolean =>
    q.x <= Math.max(p.x, r.x) + EPSILON
    && q.x + EPSILON >= Math.min(p.x, r.x)
    && q.y <= Math.max(p.y, r.y) + EPSILON
    && q.y + EPSILON >= Math.min(p.y, r.y);

  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);

  if ((o1 > 0 && o2 < 0 || o1 < 0 && o2 > 0) && (o3 > 0 && o4 < 0 || o3 < 0 && o4 > 0)) {
    return true;
  }
  if (Math.abs(o1) <= EPSILON && onSegment(a, c, b)) return true;
  if (Math.abs(o2) <= EPSILON && onSegment(a, d, b)) return true;
  if (Math.abs(o3) <= EPSILON && onSegment(c, a, d)) return true;
  if (Math.abs(o4) <= EPSILON && onSegment(c, b, d)) return true;
  return false;
};
