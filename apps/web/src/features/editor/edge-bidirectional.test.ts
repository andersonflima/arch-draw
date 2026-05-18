import { describe, expect, it } from "vitest";
import { getBidirectionalPairPrimaryEdge } from "./edge-bidirectional";

describe("edge bidirectional rules", () => {
  it("uses an existing same-direction edge when reconnecting the same pair", () => {
    const edge = { id: "edge-a-b", from: "a", to: "b" };

    expect(getBidirectionalPairPrimaryEdge([edge], "a", "b")).toBe(edge);
  });

  it("prefers the reverse edge so opposite-direction connections collapse into one pair", () => {
    const forward = { id: "edge-a-b", from: "a", to: "b" };
    const reverse = { id: "edge-b-a", from: "b", to: "a" };

    expect(getBidirectionalPairPrimaryEdge([forward, reverse], "a", "b")).toBe(reverse);
  });

  it("reuses the already drawn line when creating the opposite direction", () => {
    const existing = { id: "edge-a-b", from: "a", to: "b" };

    expect(getBidirectionalPairPrimaryEdge([existing], "b", "a")).toBe(existing);
  });

  it("ignores edges from unrelated node pairs", () => {
    const edge = { id: "edge-a-db", from: "a", to: "db" };

    expect(getBidirectionalPairPrimaryEdge([edge], "b", "db")).toBeNull();
  });
});
