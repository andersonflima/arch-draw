import { describe, expect, it } from "vitest";
import { getDragTargetPositions, hasExceededDragThreshold, panFromPointer } from "./interaction-engine";

describe("interaction engine", () => {
  it("computes pan from pointer delta", () => {
    expect(panFromPointer(
      { startPointer: { x: 100, y: 80 }, startPan: { x: 10, y: 20 } },
      { x: 130, y: 60 }
    )).toEqual({ x: 40, y: 0 });
  });

  it("checks drag threshold by euclidean distance", () => {
    expect(hasExceededDragThreshold({ x: 0, y: 0 }, { x: 3, y: 4 }, 5)).toBe(true);
    expect(hasExceededDragThreshold({ x: 0, y: 0 }, { x: 3, y: 3 }, 5)).toBe(false);
  });

  it("computes drag target positions from pointer offsets", () => {
    expect([...getDragTargetPositions({ x: 20, y: 30 }, [
      { nodeId: "a", offset: { x: 2, y: 5 } }
    ])]).toEqual([["a", { x: 18, y: 25 }]]);
  });
});
