export type CursorPublishGateInput = Readonly<{
  now: number;
  lastPublishedAt: number;
  minIntervalMs: number;
  lastPoint: Readonly<{ x: number; y: number }> | null;
  nextPoint: Readonly<{ x: number; y: number }>;
  minDistancePx: number;
}>;

export const shouldPublishCursorPoint = (input: CursorPublishGateInput): boolean => {
  if (input.now - input.lastPublishedAt >= input.minIntervalMs) {
    return true;
  }
  if (!input.lastPoint) return true;

  const deltaX = input.nextPoint.x - input.lastPoint.x;
  const deltaY = input.nextPoint.y - input.lastPoint.y;
  return Math.hypot(deltaX, deltaY) >= input.minDistancePx;
};
