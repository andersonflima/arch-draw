import { describe, expect, it } from "vitest";
import { computeArrowHead, edgeArrowAnchors, sampleCubicBezier } from "./edge-canvas-geometry";

describe("computeArrowHead", () => {
  it("points the base corners behind a tip travelling along +x", () => {
    const head = computeArrowHead({ x: 100, y: 0 }, { x: 0, y: 0 }, 10);
    expect(head).not.toBeNull();
    if (!head) return;
    // Both base corners sit behind the tip (smaller x) and are vertically mirrored.
    expect(head.left.x).toBeLessThan(100);
    expect(head.right.x).toBeLessThan(100);
    expect(head.left.y).toBeCloseTo(-head.right.y, 6);
  });

  it("returns null for a degenerate segment", () => {
    expect(computeArrowHead({ x: 5, y: 5 }, { x: 5, y: 5 }, 10)).toBeNull();
  });
});

describe("edgeArrowAnchors", () => {
  it("resolves start/end tips and their neighbours", () => {
    const anchors = edgeArrowAnchors([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 5 }
    ]);
    expect(anchors).toEqual({
      endTip: { x: 20, y: 5 },
      endFrom: { x: 10, y: 0 },
      startTip: { x: 0, y: 0 },
      startFrom: { x: 10, y: 0 }
    });
  });

  it("returns null when there are fewer than two points", () => {
    expect(edgeArrowAnchors([{ x: 0, y: 0 }])).toBeNull();
  });
});

describe("sampleCubicBezier", () => {
  it("returns segments + 1 points spanning the endpoints", () => {
    const points = sampleCubicBezier({ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 0 }, 8);
    expect(points).toHaveLength(9);
    expect(points[0]).toEqual({ x: 0, y: 0 });
    expect(points[8]).toEqual({ x: 10, y: 0 });
  });

  it("passes through the expected midpoint of a symmetric curve", () => {
    const points = sampleCubicBezier({ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 100 }, { x: 100, y: 100 }, 2);
    expect(points[1]).toEqual({ x: 50, y: 50 });
  });
});
