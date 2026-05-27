import { describe, expect, it } from "vitest";
import { createSpatialIndex } from "./spatial-index";

describe("spatial index", () => {
  it("returns only entries intersecting the query rect", () => {
    const index = createSpatialIndex([
      { id: "a", rect: { x: 0, y: 0, width: 100, height: 100 }, value: "a" },
      { id: "b", rect: { x: 900, y: 900, width: 100, height: 100 }, value: "b" }
    ], 128);

    expect(index.query({ x: 50, y: 50, width: 20, height: 20 }).map((entry) => entry.id)).toEqual(["a"]);
  });

  it("deduplicates entries spanning multiple grid cells", () => {
    const index = createSpatialIndex([
      { id: "wide", rect: { x: 0, y: 0, width: 500, height: 500 }, value: "wide" }
    ], 128);

    expect(index.query({ x: 100, y: 100, width: 300, height: 300 }).map((entry) => entry.id)).toEqual(["wide"]);
  });
});
