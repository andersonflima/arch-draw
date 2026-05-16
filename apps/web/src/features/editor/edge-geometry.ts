import type { ArchitectureEdgePath } from "@arch-draw/domain";

export type EdgePoint = Readonly<{ x: number; y: number }>;
export type EdgeFlowDirection = "forward" | "reverse";
export type EdgeTerminalAxis = "horizontal" | "vertical";

export const getEdgeTerminalAxis = (
  nodeSize: Readonly<{ width: number; height: number }>,
  anchor: EdgePoint,
  center: EdgePoint
): EdgeTerminalAxis => {
  const halfWidth = nodeSize.width / 2;
  const halfHeight = nodeSize.height / 2;
  const dx = Math.abs(anchor.x - center.x);
  const dy = Math.abs(anchor.y - center.y);
  const verticalEdgeDistance = Math.abs(dx - halfWidth);
  const horizontalEdgeDistance = Math.abs(dy - halfHeight);
  return verticalEdgeDistance <= horizontalEdgeDistance ? "horizontal" : "vertical";
};

export const getEdgeLeadPoint = (
  point: EdgePoint,
  center: EdgePoint,
  axis: EdgeTerminalAxis,
  distance: number
): EdgePoint => {
  if (axis === "horizontal") {
    const direction = Math.sign(point.x - center.x) || 1;
    return { x: point.x + direction * distance, y: point.y };
  }

  const direction = Math.sign(point.y - center.y) || 1;
  return { x: point.x, y: point.y + direction * distance };
};

export const buildFullEdgePath = (
  start: EdgePoint,
  startLead: EdgePoint,
  endLead: EdgePoint,
  end: EdgePoint,
  path: ArchitectureEdgePath
): string => {
  const midX = (startLead.x + endLead.x) / 2;
  if (path === "straight") {
    return `M ${start.x} ${start.y} L ${startLead.x} ${startLead.y} L ${endLead.x} ${endLead.y} L ${end.x} ${end.y}`;
  }
  if (path === "step") {
    return `M ${start.x} ${start.y} L ${startLead.x} ${startLead.y} L ${midX} ${startLead.y} L ${midX} ${endLead.y} L ${endLead.x} ${endLead.y} L ${end.x} ${end.y}`;
  }
  return `M ${start.x} ${start.y} L ${startLead.x} ${startLead.y} C ${midX} ${startLead.y}, ${midX} ${endLead.y}, ${endLead.x} ${endLead.y} L ${end.x} ${end.y}`;
};

export const buildEdgeHalfPath = (
  start: EdgePoint,
  startLead: EdgePoint,
  endLead: EdgePoint,
  end: EdgePoint,
  path: ArchitectureEdgePath,
  direction: EdgeFlowDirection
): string => {
  const midX = (startLead.x + endLead.x) / 2;
  const center = { x: (startLead.x + endLead.x) / 2, y: (startLead.y + endLead.y) / 2 };
  if (path === "straight") {
    if (direction === "forward") {
      return `M ${center.x} ${center.y} L ${endLead.x} ${endLead.y} L ${end.x} ${end.y}`;
    }
    return `M ${center.x} ${center.y} L ${startLead.x} ${startLead.y} L ${start.x} ${start.y}`;
  }

  if (path === "step") {
    const centerStep = { x: midX, y: (startLead.y + endLead.y) / 2 };
    if (direction === "forward") {
      return `M ${centerStep.x} ${centerStep.y} L ${midX} ${endLead.y} L ${endLead.x} ${endLead.y} L ${end.x} ${end.y}`;
    }
    return `M ${centerStep.x} ${centerStep.y} L ${midX} ${startLead.y} L ${startLead.x} ${startLead.y} L ${start.x} ${start.y}`;
  }

  const p0 = startLead;
  const p1 = { x: midX, y: startLead.y };
  const p2 = { x: midX, y: endLead.y };
  const p3 = endLead;
  const p01 = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
  const p12 = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  const p23 = { x: (p2.x + p3.x) / 2, y: (p2.y + p3.y) / 2 };
  const p012 = { x: (p01.x + p12.x) / 2, y: (p01.y + p12.y) / 2 };
  const p123 = { x: (p12.x + p23.x) / 2, y: (p12.y + p23.y) / 2 };
  const p0123 = { x: (p012.x + p123.x) / 2, y: (p012.y + p123.y) / 2 };

  if (direction === "forward") {
    return `M ${p0123.x} ${p0123.y} C ${p123.x} ${p123.y}, ${p23.x} ${p23.y}, ${p3.x} ${p3.y} L ${end.x} ${end.y}`;
  }
  return `M ${p0123.x} ${p0123.y} C ${p012.x} ${p012.y}, ${p01.x} ${p01.y}, ${p0.x} ${p0.y} L ${start.x} ${start.y}`;
};

export const offsetSegmentEndpoints = (
  start: EdgePoint,
  end: EdgePoint,
  startInset: number,
  endInset: number
): Readonly<{ start: EdgePoint; end: EdgePoint }> => {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const distance = Math.hypot(deltaX, deltaY);
  if (distance === 0) return { start, end };

  const maxInset = Math.max(0, Math.min(startInset + endInset, distance - 1));
  const safeStartInset = maxInset === startInset + endInset
    ? (startInset / (startInset + endInset || 1)) * maxInset
    : startInset;
  const safeEndInset = maxInset === startInset + endInset
    ? (endInset / (startInset + endInset || 1)) * maxInset
    : endInset;

  const unitX = deltaX / distance;
  const unitY = deltaY / distance;
  return {
    start: {
      x: start.x + unitX * safeStartInset,
      y: start.y + unitY * safeStartInset
    },
    end: {
      x: end.x - unitX * safeEndInset,
      y: end.y - unitY * safeEndInset
    }
  };
};

export const applyEdgeMarkerClearance = (
  start: EdgePoint,
  end: EdgePoint,
  hasStartMarker: boolean,
  markerClearance: number
): Readonly<{ start: EdgePoint; end: EdgePoint }> =>
  offsetSegmentEndpoints(
    start,
    end,
    hasStartMarker ? markerClearance : 0,
    markerClearance
  );
