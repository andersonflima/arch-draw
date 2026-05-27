import { describe, expect, it } from "vitest";
import {
  getConnectionTargetHitRadius,
  getLaneOffset,
  getNearestConnectionTargetCandidate,
  resolveConnectionSide
} from "./connector-engine";

describe("connector engine", () => {
  it("keeps non-omni nodes on left/right ports", () => {
    expect(resolveConnectionSide(
      { id: "a", center: { x: 0, y: 0 }, hasOmniPorts: false },
      { x: 0, y: 100 },
      "source",
      "top"
    )).toBe("right");
  });

  it("uses nearest target port within hit radius", () => {
    expect(getNearestConnectionTargetCandidate(
      "target",
      { x: 10, y: 0 },
      ["left", "right"],
      16,
      (side) => side === "left" ? { x: 0, y: 0 } : { x: 100, y: 0 }
    )).toEqual({ nodeId: "target", targetPort: "left", distance: 10 });
  });

  it("respects minimum screen hit radius", () => {
    expect(getConnectionTargetHitRadius(10, 0.25)).toBe(96);
  });

  it("centers lane offsets for bundled edges", () => {
    expect(getLaneOffset(["a", "b", "c"], "b", {
      laneGap: 10,
      laneMaxOffset: 20,
      strictPortAnchoring: true
    })).toBe(0);
  });
});
