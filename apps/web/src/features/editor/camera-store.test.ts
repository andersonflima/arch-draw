import { describe, expect, it } from "vitest";
import { CameraStore } from "./camera-store";

describe("CameraStore", () => {
  it("starts centred at zoom 1", () => {
    const store = new CameraStore();
    expect(store.zoom()).toBe(1);
    expect(store.pan()).toEqual({ x: 0, y: 0 });
  });

  it("tracks zoom changes", () => {
    const store = new CameraStore();
    store.setZoom(2.5);
    expect(store.zoom()).toBe(2.5);
    store.setZoom(0.5);
    expect(store.zoom()).toBe(0.5);
  });

  it("tracks pan changes independently of zoom", () => {
    const store = new CameraStore();
    store.setPan({ x: -120, y: 80 });
    expect(store.pan()).toEqual({ x: -120, y: 80 });
    expect(store.zoom()).toBe(1);
  });
});
