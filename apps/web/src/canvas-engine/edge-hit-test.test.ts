import { describe, expect, it } from "vitest";
import type { RenderableEdge } from "./edge-render-model";
import { distanceToSegment, hitTestEdges } from "./edge-hit-test";

const edge = (id: string, points: ReadonlyArray<readonly [number, number]>): RenderableEdge => ({
  id,
  points: points.map(([x, y]) => ({ x, y })),
  stroke: "#000",
  lineWidth: 2,
  dash: [],
  arrowStart: false,
  arrowEnd: true,
  cornerRadius: 0,
  opacity: 1
});

describe("distanceToSegment", () => {
  it("measures perpendicular distance to a segment", () => {
    expect(distanceToSegment({ x: 5, y: 5 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(5, 6);
  });

  it("clamps to the nearest endpoint beyond the segment", () => {
    expect(distanceToSegment({ x: -3, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(3, 6);
  });

  it("handles a degenerate zero-length segment", () => {
    expect(distanceToSegment({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBeCloseTo(5, 6);
  });
});

describe("hitTestEdges", () => {
  const edges = [
    edge("a", [[0, 0], [100, 0]]),
    edge("b", [[0, 50], [100, 50]])
  ];

  it("returns the edge within the threshold", () => {
    expect(hitTestEdges(edges, { x: 40, y: 3 }, 8)).toBe("a");
    expect(hitTestEdges(edges, { x: 40, y: 47 }, 8)).toBe("b");
  });

  it("returns null when nothing is within the threshold", () => {
    expect(hitTestEdges(edges, { x: 40, y: 25 }, 8)).toBeNull();
  });

  it("prefers the edge drawn on top when two overlap", () => {
    const overlapping = [edge("under", [[0, 0], [100, 0]]), edge("over", [[0, 0], [100, 0]])];
    expect(hitTestEdges(overlapping, { x: 50, y: 0 }, 5)).toBe("over");
  });
});
