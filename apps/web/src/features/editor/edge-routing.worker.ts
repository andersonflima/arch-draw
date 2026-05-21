/// <reference lib="webworker" />

import {
  routePolylineAroundObstacles,
  type EdgeObstacleRect
} from "./edge-routing";
import type { EdgePoint } from "./edge-geometry";

type RouteRequest = Readonly<{
  requestId: string;
  points: readonly EdgePoint[];
  obstacles: readonly EdgeObstacleRect[];
  sourceId: string;
  targetId: string;
  maxPasses: number;
  obstacleClearance: number;
}>;

type RouteResponse = Readonly<{
  requestId: string;
  points: readonly EdgePoint[];
}>;

addEventListener("message", ({ data }: MessageEvent<RouteRequest>) => {
  const result = routePolylineAroundObstacles(
    data.points,
    data.obstacles,
    data.sourceId,
    data.targetId,
    {
      maxPasses: data.maxPasses,
      obstacleClearance: data.obstacleClearance
    }
  );

  const response: RouteResponse = {
    requestId: data.requestId,
    points: result
  };
  postMessage(response);
});

