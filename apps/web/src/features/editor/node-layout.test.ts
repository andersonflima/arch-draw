import { describe, expect, it } from "vitest";
import {
  computeLeafLabelCharacterLimit,
  computeLeafNodeIconSize,
  computeNodePortMetrics,
  truncateLeafNodeLabel
} from "./node-layout";

describe("node layout", () => {
  it("computes bounded node-port metrics from node size", () => {
    const metrics = computeNodePortMetrics(
      { width: 300, height: 120 },
      {
        minHitWidth: 18,
        maxHitWidth: 34,
        minInset: 10,
        maxInset: 32,
        minDotSize: 12,
        maxDotSize: 18,
        minOmniSize: 20,
        maxOmniSize: 32
      }
    );

    expect(metrics.hitWidth).toBeGreaterThanOrEqual(18);
    expect(metrics.hitWidth).toBeLessThanOrEqual(34);
    expect(metrics.dotSize).toBeGreaterThanOrEqual(12);
    expect(metrics.dotSize).toBeLessThanOrEqual(18);
    expect(metrics.edgeOffset).toBe(metrics.dotSize + 1);
    expect(metrics.omniOffset).toBe(Math.round(metrics.omniSize / 2 + 1));
  });

  it("computes leaf icon size bounded by node box and global icon scale", () => {
    const size = computeLeafNodeIconSize({
      nodeSize: { width: 220, height: 180 },
      nodeIconSize: 100,
      defaultNodeIconSize: 100,
      leafAnchorIconSize: 84,
      leafAnchorTopOffset: 4
    });
    expect(size).toBeGreaterThanOrEqual(32);
    expect(size).toBeLessThanOrEqual(84);
  });

  it("expands leaf label limit with width and icon size gains", () => {
    const small = computeLeafLabelCharacterLimit({
      nodeWidth: 108,
      nodeIconSize: 100,
      defaultNodeIconSize: 100,
      baseChars: 24,
      maxChars: 44
    });
    const large = computeLeafLabelCharacterLimit({
      nodeWidth: 308,
      nodeIconSize: 120,
      defaultNodeIconSize: 100,
      baseChars: 24,
      maxChars: 44
    });

    expect(small).toBe(24);
    expect(large).toBeGreaterThan(small);
    expect(large).toBeLessThanOrEqual(44);
  });

  it("truncates labels keeping two full words and part of the third", () => {
    expect(truncateLeafNodeLabel("Subnet Ops / Observability", 24)).toBe("Subnet Ops /...");
    expect(truncateLeafNodeLabel("Subnet Ops SuperLongObservabilityWord", 24)).toBe("Subnet Ops SuperLongO...");
    expect(truncateLeafNodeLabel("SuperLongSubnetName SuperLongDatabaseName", 24)).toBe("SuperLongSubnetName S...");
    expect(truncateLeafNodeLabel("Subnet Ops", 24)).toBe("Subnet Ops");
    expect(truncateLeafNodeLabel("Subnet", 24)).toBe("Subnet");
  });
});
