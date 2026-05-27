import type { SpatialPoint } from "../spatial/geometry";

export type PanGesture = Readonly<{
  startPointer: SpatialPoint;
  startPan: SpatialPoint;
}>;

export type DragPointerOffset = Readonly<{
  nodeId: string;
  offset: SpatialPoint;
}>;

export const panFromPointer = (
  gesture: PanGesture,
  pointer: SpatialPoint
): SpatialPoint => ({
  x: gesture.startPan.x + pointer.x - gesture.startPointer.x,
  y: gesture.startPan.y + pointer.y - gesture.startPointer.y
});

export const hasExceededDragThreshold = (
  startPoint: SpatialPoint,
  point: SpatialPoint,
  threshold: number
): boolean => Math.hypot(point.x - startPoint.x, point.y - startPoint.y) >= threshold;

export const getDragTargetPositions = (
  pointerPoint: SpatialPoint,
  offsets: Iterable<DragPointerOffset>
): ReadonlyMap<string, SpatialPoint> => {
  const targetById = new Map<string, SpatialPoint>();
  for (const { nodeId, offset } of offsets) {
    targetById.set(nodeId, {
      x: pointerPoint.x - offset.x,
      y: pointerPoint.y - offset.y
    });
  }
  return targetById;
};
