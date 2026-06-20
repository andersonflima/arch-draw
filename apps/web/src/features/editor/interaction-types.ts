import type { ArchitectureEdgePortSide } from "@arch-draw/domain";

// Transient pointer-gesture state for the canvas, shared by the root editor
// component and the InteractionStore that owns it. These are plain value objects
// describing an in-progress drag, resize, marquee, connection or pan.

export type Point = Readonly<{ x: number; y: number }>;

export type DragState = Readonly<{
  pointerOffsets: ReadonlyMap<string, Point>;
  startPoint: Point;
  hasMoved: boolean;
}>;

export type ResizeDirection = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export type ResizeState = Readonly<{
  nodeId: string;
  direction: ResizeDirection;
  startPoint: Point;
  startPosition: Point;
  startSize: Readonly<{ width: number; height: number }>;
}>;

export type MarqueeState = Readonly<{
  start: Point;
  current: Point;
}>;

export type ConnectionDragState = Readonly<{
  sourceId: string;
  sourcePort: ArchitectureEdgePortSide | null;
  start: Point;
  current: Point;
}>;

export type PanState = Readonly<{
  startPointer: Point;
  startPan: Point;
}>;
