import { describe, expect, it } from "vitest";
import {
  applyEdgeMarkerClearance,
  buildEdgeHalfPath,
  buildFullEdgePath,
  getEdgeLeadPoint,
  getEdgeTerminalAxis,
  offsetSegmentEndpoints
} from "./edge-geometry";

describe("edge geometry", () => {
  it("detects the terminal axis based on the anchor side", () => {
    const size = { width: 200, height: 120 };
    const center = { x: 100, y: 100 };
    expect(getEdgeTerminalAxis(size, { x: 200, y: 110 }, center)).toBe("horizontal");
    expect(getEdgeTerminalAxis(size, { x: 105, y: 160 }, center)).toBe("vertical");
  });

  it("projects lead points outward from node border", () => {
    const center = { x: 100, y: 100 };
    expect(getEdgeLeadPoint({ x: 200, y: 100 }, center, "horizontal", 20)).toEqual({ x: 220, y: 100 });
    expect(getEdgeLeadPoint({ x: 100, y: 40 }, center, "vertical", 20)).toEqual({ x: 100, y: 20 });
  });

  it("keeps endpoint offsets inside segment length", () => {
    const start = { x: 0, y: 0 };
    const end = { x: 10, y: 0 };
    expect(offsetSegmentEndpoints(start, end, 8, 8)).toEqual({
      start: { x: 8, y: 0 },
      end: { x: 2, y: 0 }
    });
  });

  it("applies marker clearance at the end and optionally at the start", () => {
    const start = { x: 0, y: 0 };
    const end = { x: 100, y: 0 };
    expect(applyEdgeMarkerClearance(start, end, false, 6)).toEqual({
      start: { x: 0, y: 0 },
      end: { x: 94, y: 0 }
    });
    expect(applyEdgeMarkerClearance(start, end, true, 6)).toEqual({
      start: { x: 6, y: 0 },
      end: { x: 94, y: 0 }
    });
  });

  it("builds full path with straight endpoint stubs", () => {
    const path = buildFullEdgePath(
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 80, y: 40 },
      { x: 100, y: 40 },
      "smoothstep"
    );
    expect(path).toContain("M 0 0 L 20 0 C");
    expect(path).toContain("L 100 40");
  });

  it("builds smooth half paths that preserve endpoint stubs", () => {
    const forward = buildEdgeHalfPath(
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 80, y: 40 },
      { x: 100, y: 40 },
      "smoothstep",
      "forward"
    );
    const reverse = buildEdgeHalfPath(
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 80, y: 40 },
      { x: 100, y: 40 },
      "smoothstep",
      "reverse"
    );
    expect(forward).toContain("C");
    expect(forward).toContain("L 100 40");
    expect(reverse).toContain("C");
    expect(reverse).toContain("L 0 0");
  });
});
