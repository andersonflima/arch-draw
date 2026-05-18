import { describe, expect, it } from "vitest";
import { buildRoundedPolylinePath } from "./edge-rounded-path";
import type { EdgeObstacleRect } from "./edge-routing";

describe("edge rounded path", () => {
  it("keeps rounded corners when no obstacle is crossed by the curve", () => {
    const path = buildRoundedPolylinePath(
      [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }],
      20,
      "smoothstep"
    );

    expect(path).toContain(" Q 100 0 ");
  });

  it("keeps a straight corner when the rounded curve would cross an obstacle", () => {
    const obstacle: EdgeObstacleRect = {
      id: "corner-blocker",
      left: 84,
      top: 4,
      right: 96,
      bottom: 12
    };

    const path = buildRoundedPolylinePath(
      [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }],
      40,
      "smoothstep",
      [obstacle]
    );

    expect(path).toBe("M 0 0 L 100 0 L 100 100");
  });
});
