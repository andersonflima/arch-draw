import type { EdgePoint } from "./edge-geometry";
import type { EdgeObstacleRect } from "./edge-routing";

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

type PendingRequest = Readonly<{
  resolve: (points: readonly EdgePoint[]) => void;
  reject: (cause: unknown) => void;
}>;

let worker: Worker | null = null;
const pending = new Map<string, PendingRequest>();

const getWorker = (): Worker | null => {
  if (typeof Worker === "undefined") return null;
  if (worker) return worker;
  worker = new Worker(new URL("./edge-routing.worker", import.meta.url), { type: "module" });
  worker.addEventListener("message", ({ data }: MessageEvent<RouteResponse>) => {
    const request = pending.get(data.requestId);
    if (!request) return;
    pending.delete(data.requestId);
    request.resolve(data.points);
  });
  worker.addEventListener("error", (cause) => {
    for (const request of pending.values()) request.reject(cause);
    pending.clear();
  });
  return worker;
};

export const routePolylineAroundObstaclesInWorker = async (
  request: Omit<RouteRequest, "requestId">
): Promise<readonly EdgePoint[] | null> => {
  const activeWorker = getWorker();
  if (!activeWorker) return null;

  const requestId = crypto.randomUUID();
  const payload: RouteRequest = {
    requestId,
    ...request
  };

  return await new Promise<readonly EdgePoint[] | null>((resolve) => {
    pending.set(requestId, {
      resolve: (points) => resolve(points),
      reject: () => resolve(null)
    });
    activeWorker.postMessage(payload);
  });
};

