import { describe, expect, it } from "vitest";
import { getVisibleWorldRect, screenToWorld, zoomCameraAtScreenPoint } from "./camera";

describe("camera", () => {
  it("converts screen coordinates to world coordinates", () => {
    expect(screenToWorld(
      { zoom: 2, pan: { x: 20, y: 40 } },
      { x: 10, y: 10 },
      { x: 130, y: 250 }
    )).toEqual({ x: 50, y: 100 });
  });

  it("keeps the world point under the cursor stable when zooming", () => {
    const camera = { zoom: 1, pan: { x: 0, y: 0 } };
    const next = zoomCameraAtScreenPoint(camera, 2, { x: 0, y: 0 }, { x: 100, y: 100 });

    expect(screenToWorld(next, { x: 0, y: 0 }, { x: 100, y: 100 })).toEqual({ x: 100, y: 100 });
  });

  it("computes visible world rect from camera state", () => {
    expect(getVisibleWorldRect(
      { zoom: 2, pan: { x: -40, y: -80 } },
      { width: 1000, height: 600 },
      { width: 320, height: 220 }
    )).toEqual({ x: 20, y: 40, width: 500, height: 300 });
  });
});
