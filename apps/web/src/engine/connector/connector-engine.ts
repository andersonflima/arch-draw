import type { ArchitectureEdgePortSide } from "@arch-draw/domain";
import type { SpatialPoint } from "../spatial/geometry";

export type ConnectorNode = Readonly<{
  id: string;
  center: SpatialPoint;
  hasOmniPorts: boolean;
}>;

export type ConnectionTargetCandidate = Readonly<{
  nodeId: string;
  targetPort: ArchitectureEdgePortSide | null;
  distance: number;
}>;

export const getConnectionSideTowardPoint = (
  node: ConnectorNode,
  target: SpatialPoint,
  role: "source" | "target"
): ArchitectureEdgePortSide => {
  const dx = target.x - node.center.x;
  const dy = target.y - node.center.y;

  if (!node.hasOmniPorts) {
    if (Math.abs(dx) < 0.001) return role === "source" ? "right" : "left";
    return dx >= 0 ? "right" : "left";
  }

  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
    return role === "source" ? "right" : "left";
  }
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "right" : "left";
  return dy >= 0 ? "bottom" : "top";
};

export const resolveConnectionSide = (
  node: ConnectorNode,
  target: SpatialPoint,
  role: "source" | "target",
  preferredSide?: ArchitectureEdgePortSide
): ArchitectureEdgePortSide => {
  if (preferredSide) {
    if (!node.hasOmniPorts && (preferredSide === "top" || preferredSide === "bottom")) {
      return role === "source" ? "right" : "left";
    }
    return preferredSide;
  }

  return getConnectionSideTowardPoint(node, target, role);
};

export const getConnectionTargetSides = (
  hasOmniPorts: boolean
): readonly ArchitectureEdgePortSide[] =>
  hasOmniPorts ? ["top", "right", "bottom", "left"] : ["left"];

export const getConnectionTargetHitRadius = (
  portRadius: number,
  zoom: number
): number => {
  const screenMinimum = 28 / Math.max(zoom, 0.2);
  return Math.min(96, Math.max(screenMinimum, portRadius));
};

export const getNearestConnectionTargetCandidate = (
  nodeId: string,
  point: SpatialPoint,
  targetSides: readonly ArchitectureEdgePortSide[],
  hitRadius: number,
  getAnchor: (side: ArchitectureEdgePortSide) => SpatialPoint
): ConnectionTargetCandidate | null => {
  let best: ConnectionTargetCandidate | null = null;

  for (const targetPort of targetSides) {
    const anchor = getAnchor(targetPort);
    const distance = Math.hypot(point.x - anchor.x, point.y - anchor.y);
    if (distance > hitRadius) continue;
    if (!best || distance < best.distance) {
      best = { nodeId, targetPort, distance };
    }
  }

  return best;
};

export const getLaneOffset = (
  edgeIds: readonly string[],
  edgeId: string,
  options: Readonly<{
    laneGap: number;
    laneMaxOffset: number;
    strictPortAnchoring: boolean;
  }>
): number => {
  const currentIndex = edgeIds.indexOf(edgeId);
  if (currentIndex < 0 || edgeIds.length <= 1) return 0;

  const laneMaxOffset = options.strictPortAnchoring
    ? Math.max(options.laneMaxOffset, ((edgeIds.length - 1) * options.laneGap) / 2)
    : options.laneMaxOffset;
  const centeredIndex = currentIndex - (edgeIds.length - 1) / 2;
  return Math.max(
    -laneMaxOffset,
    Math.min(laneMaxOffset, centeredIndex * options.laneGap)
  );
};
