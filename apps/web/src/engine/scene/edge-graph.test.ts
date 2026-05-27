import { describe, expect, it } from "vitest";
import { createEdgeGraph } from "./edge-graph";

describe("edge graph", () => {
  it("indexes edges by id and unordered node pair", () => {
    const graph = createEdgeGraph([
      { id: "a", from: "one", to: "two" },
      { id: "b", from: "two", to: "one" },
      { id: "c", from: "two", to: "three" }
    ]);

    expect(graph.getEdge("a")?.id).toBe("a");
    expect(graph.getPairEdges("one", "two").map((edge) => edge.id)).toEqual(["a", "b"]);
    expect(graph.getPairEdges("three", "one")).toEqual([]);
  });
});
