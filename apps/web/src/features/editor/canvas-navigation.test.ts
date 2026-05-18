import { describe, expect, it } from "vitest";
import {
  normalizeCanvasWheelDelta,
  panCanvasFromWheel
} from "./canvas-navigation";

describe("canvas navigation", () => {
  const options = { lineHeight: 16, pageHeight: 800 };

  it("keeps pixel wheel deltas unchanged", () => {
    expect(normalizeCanvasWheelDelta({ deltaX: 12, deltaY: -30, deltaMode: 0 }, options)).toEqual({
      x: 12,
      y: -30
    });
  });

  it("normalizes line and page based wheel deltas", () => {
    expect(normalizeCanvasWheelDelta({ deltaX: 2, deltaY: 3, deltaMode: 1 }, options)).toEqual({
      x: 32,
      y: 48
    });
    expect(normalizeCanvasWheelDelta({ deltaX: 1, deltaY: -1, deltaMode: 2 }, options)).toEqual({
      x: 800,
      y: -800
    });
  });

  it("moves the canvas viewport from a two-finger wheel gesture", () => {
    expect(panCanvasFromWheel({ x: 100, y: 80 }, { deltaX: 10, deltaY: -20, deltaMode: 0 }, options)).toEqual({
      x: 90,
      y: 100
    });
  });
});
