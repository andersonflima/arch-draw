import { describe, expect, it } from "vitest";
import { applyDocumentPatch, createHistoryEntry, pushHistoryEntry, type PatchSnapshot } from "./patch-history";

type Node = Readonly<{ id: string; label: string }>;
type Edge = Readonly<{ id: string; from: string; to: string }>;

const serialize = (value: unknown): string => JSON.stringify(value);

describe("patch history", () => {
  it("stores entity deltas and applies backward patches", () => {
    const previous: PatchSnapshot<Node, Edge> = {
      title: "A",
      description: "",
      mermaidSource: "graph LR",
      nodes: [{ id: "n1", label: "one" }],
      edges: []
    };
    const next: PatchSnapshot<Node, Edge> = {
      ...previous,
      nodes: [{ id: "n1", label: "renamed" }, { id: "n2", label: "two" }]
    };

    const entry = createHistoryEntry(previous, next, "next", serialize, serialize);

    expect(entry.forward.nodes.upsert.map((node) => node.id)).toEqual(["n1", "n2"]);
    expect(entry.backward.nodes.remove).toEqual(["n2"]);
    expect(applyDocumentPatch(next, entry.backward)).toEqual(previous);
  });

  it("truncates future entries when pushing after undo", () => {
    const state = pushHistoryEntry(
      {
        entries: [
          { signature: "a", forward: emptyPatch(), backward: emptyPatch() },
          { signature: "b", forward: emptyPatch(), backward: emptyPatch() }
        ],
        index: 0
      },
      { signature: "c", forward: emptyPatch(), backward: emptyPatch() },
      10
    );

    expect(state.entries.map((entry) => entry.signature)).toEqual(["a", "c"]);
    expect(state.index).toBe(1);
  });
});

const emptyPatch = () => ({
  nodes: { upsert: [], remove: [], order: [] },
  edges: { upsert: [], remove: [], order: [] }
});
