export type CanvasPan = Readonly<{ x: number; y: number }>;

export type WheelDeltaMode = 0 | 1 | 2;

export type CanvasWheelDelta = Readonly<{
  deltaX: number;
  deltaY: number;
  deltaMode: WheelDeltaMode;
}>;

export type CanvasWheelPanOptions = Readonly<{
  lineHeight: number;
  pageHeight: number;
}>;

export const normalizeCanvasWheelDelta = (
  delta: CanvasWheelDelta,
  options: CanvasWheelPanOptions
): CanvasPan => {
  const multiplier =
    delta.deltaMode === 1
      ? options.lineHeight
      : delta.deltaMode === 2
        ? options.pageHeight
        : 1;

  return {
    x: delta.deltaX * multiplier,
    y: delta.deltaY * multiplier
  };
};

export const panCanvasFromWheel = (
  pan: CanvasPan,
  delta: CanvasWheelDelta,
  options: CanvasWheelPanOptions
): CanvasPan => {
  const normalized = normalizeCanvasWheelDelta(delta, options);

  return {
    x: pan.x - normalized.x,
    y: pan.y - normalized.y
  };
};
