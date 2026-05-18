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

  it("prefers a collision-free detour with the fewest bends", () => {
    const obstacle: EdgeObstacleRect = {
      id: "middle",
      left: 100,
      top: 80,
      right: 200,
      bottom: 120
    };

    const routed = routePolylineAroundObstacles(
      [{ x: 20, y: 100 }, { x: 280, y: 100 }],
      [obstacle],
      "source",
      "target",
      { maxPasses: 10, obstacleClearance: 24 }
    );

    expect(countPolylineBends(routed)).toBe(2);
    for (let index = 0; index < routed.length - 1; index += 1) {
      const start = routed[index];
      const end = routed[index + 1];
      if (!start || !end) continue;
      expect(segmentIntersectsRect(start, end, obstacle)).toBe(false);
    }
  });

  it("reroutes in every cardinal direction", () => {
    const obstacle: EdgeObstacleRect = {
      id: "middle",
      left: 80,
      top: 80,
      right: 140,
      bottom: 140
    };
    const scenarios = [
      [{ x: 20, y: 110 }, { x: 210, y: 110 }],
      [{ x: 210, y: 110 }, { x: 20, y: 110 }],
      [{ x: 110, y: 20 }, { x: 110, y: 210 }],
      [{ x: 110, y: 210 }, { x: 110, y: 20 }]
    ] as const;

    for (const [start, end] of scenarios) {
      const routed = routePolylineAroundObstacles(
        [start, end],
        [obstacle],
        "source",
        "target",
        { maxPasses: 12, obstacleClearance: 26 }
      );
      expect(routed.length).toBeGreaterThanOrEqual(2);

      for (let index = 0; index < routed.length - 1; index += 1) {
        const from = routed[index];
        const to = routed[index + 1];
        if (!from || !to) continue;
        expect(segmentIntersectsRect(from, to, obstacle)).toBe(false);
      }
    }
  });

  it("routes between nodes inside distinct container boundaries", () => {
    const containerA: EdgeObstacleRect = {
      id: "container-a",
      left: 10,
      top: 10,
      right: 180,
      bottom: 180
    };
    const containerB: EdgeObstacleRect = {
      id: "container-b",
      left: 220,
      top: 10,
      right: 390,
      bottom: 180
    };
    const blocker: EdgeObstacleRect = {
      id: "between",
      left: 185,
      top: 70,
      right: 215,
      bottom: 120
    };

    const routed = routePolylineAroundObstacles(
      [{ x: 175, y: 95 }, { x: 225, y: 95 }],
      [containerA, containerB, blocker],
      "source",
      "target",
      { maxPasses: 12, obstacleClearance: 20 }
    );

    expect(routed.length).toBeGreaterThan(2);
    for (let index = 0; index < routed.length - 1; index += 1) {
      const from = routed[index];
      const to = routed[index + 1];
      if (!from || !to) continue;
      expect(segmentIntersectsRect(from, to, blocker)).toBe(false);
    }
  });

  it("remains valid after geometry changes that emulate resize/drag", () => {
    const obstacleBefore: EdgeObstacleRect = {
      id: "node-bounds",
      left: 90,
      top: 90,
      right: 150,
      bottom: 150
    };
    const obstacleAfter: EdgeObstacleRect = {
      id: "node-bounds",
      left: 130,
      top: 130,
      right: 210,
      bottom: 210
    };

    const initialPath = routePolylineAroundObstacles(
      [{ x: 20, y: 120 }, { x: 260, y: 120 }],
      [obstacleBefore],
      "source",
      "target",
      { maxPasses: 12, obstacleClearance: 24 }
    );
    const updatedPath = routePolylineAroundObstacles(
      [{ x: 20, y: 180 }, { x: 300, y: 180 }],
      [obstacleAfter],
      "source",
      "target",
      { maxPasses: 12, obstacleClearance: 24 }
    );

    expect(initialPath.length).toBeGreaterThanOrEqual(2);
    expect(updatedPath.length).toBeGreaterThanOrEqual(2);
    for (let index = 0; index < updatedPath.length - 1; index += 1) {
      const from = updatedPath[index];
      const to = updatedPath[index + 1];
      if (!from || !to) continue;
      expect(segmentIntersectsRect(from, to, obstacleAfter)).toBe(false);
    }
  });

  it("keeps endpoint hard boundaries blocking along the whole route", () => {
    const sourcePadded: EdgeObstacleRect = {
      id: "source",
      left: 0,
      top: 20,
      right: 120,
      bottom: 180
    };
    const sourceHard: EdgeObstacleRect = {
      id: "source__hard",
      left: 28,
      top: 78,
      right: 88,
      bottom: 122
    };
    const targetPadded: EdgeObstacleRect = {
      id: "target",
      left: 200,
      top: 20,
      right: 300,
      bottom: 180
    };
    const targetHard: EdgeObstacleRect = {
      id: "target__hard",
      left: 220,
      top: 78,
      right: 250,
      bottom: 122
    };
    const routed = routePolylineAroundObstacles(
      [{ x: 180, y: 100 }, { x: 280, y: 100 }],
      [sourcePadded, sourceHard, targetPadded, targetHard],
      "source",
      "target",
      { maxPasses: 12, obstacleClearance: 18 }
    );

    expect(routed.length).toBeGreaterThanOrEqual(2);
    for (let index = 0; index < routed.length - 1; index += 1) {
      const from = routed[index];
      const to = routed[index + 1];
      if (!from || !to) continue;
      expect(segmentIntersectsRect(from, to, sourceHard)).toBe(false);
      expect(segmentIntersectsRect(from, to, targetHard)).toBe(false);
    }
  });

  it("treats contact shields as strict invisible obstacles", () => {
    const contactShield: EdgeObstacleRect = {
      id: "middle__contact-shield",
      left: 80,
      top: 100,
      right: 140,
      bottom: 150
    };

    const routed = routePolylineAroundObstacles(
      [{ x: 20, y: 100 }, { x: 220, y: 100 }],
      [contactShield],
      "source",
      "target",
      { maxPasses: 12, obstacleClearance: 24 }
    );

    expect(routed.length).toBeGreaterThan(2);
    for (let index = 0; index < routed.length - 1; index += 1) {
      const from = routed[index];
      const to = routed[index + 1];
      if (!from || !to) continue;
      expect(segmentIntersectsRect(from, to, contactShield)).toBe(false);
    }
  });
});

const countPolylineBends = (points: readonly Readonly<{ x: number; y: number }>[]): number => {
  let bends = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const next = points[index + 1];
    if (!previous || !current || !next) continue;
    const incomingHorizontal = Math.abs(current.y - previous.y) <= 0.001;
    const outgoingHorizontal = Math.abs(next.y - current.y) <= 0.001;
    if (incomingHorizontal !== outgoingHorizontal) bends += 1;
  }
  return bends;
};
