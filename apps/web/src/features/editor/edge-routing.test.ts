import { describe, expect, it } from "vitest";
import {
  routePolylineAroundObstacles,
  segmentIntersectsRect,
  type EdgeObstacleRect
} from "./edge-routing";

describe("edge routing", () => {
  it("keeps path unchanged when there are no obstacles", () => {
    const points = [
      { x: 10, y: 10 },
      { x: 40, y: 10 },
      { x: 70, y: 10 }
    ];

    const routed = routePolylineAroundObstacles(points, [], "source", "target", {
      maxPasses: 10,
      obstacleClearance: 30
    });

    expect(routed).toEqual([{ x: 10, y: 10 }, { x: 70, y: 10 }]);
  });

  it("reroutes around an intermediate obstacle", () => {
    const obstacle: EdgeObstacleRect = {
      id: "middle",
      left: 70,
      top: 70,
      right: 130,
      bottom: 130
    };
    const points = [
      { x: 20, y: 100 },
      { x: 100, y: 100 },
      { x: 180, y: 100 }
    ];

    const routed = routePolylineAroundObstacles(
      points,
      [obstacle],
      "source",
      "target",
      { maxPasses: 10, obstacleClearance: 30 }
    );

    expect(routed.length).toBeGreaterThan(2);
    expect(routed).not.toEqual(points);

    for (let index = 0; index < routed.length - 1; index += 1) {
      const start = routed[index];
      const end = routed[index + 1];
      if (!start || !end) continue;
      expect(segmentIntersectsRect(start, end, obstacle)).toBe(false);
    }
  });
});
