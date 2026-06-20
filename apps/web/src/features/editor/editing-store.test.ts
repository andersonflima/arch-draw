import { describe, expect, it } from "vitest";
import { EditingStore } from "./editing-store";

describe("EditingStore", () => {
  it("starts with nothing being edited", () => {
    const store = new EditingStore();
    expect(store.nodeId()).toBeNull();
    expect(store.edgeId()).toBeNull();
    expect(store.nodeLabelDraft()).toBe("");
    expect(store.edgeLabelDraft()).toBe("");
  });

  it("tracks node label editing and its draft", () => {
    const store = new EditingStore();
    store.setNodeId("n1");
    store.setNodeLabelDraft("Service");
    expect(store.nodeId()).toBe("n1");
    expect(store.nodeLabelDraft()).toBe("Service");
    store.setNodeId(null);
    store.setNodeLabelDraft("");
    expect(store.nodeId()).toBeNull();
    expect(store.nodeLabelDraft()).toBe("");
  });

  it("tracks edge label editing independently of node editing", () => {
    const store = new EditingStore();
    store.setNodeId("n1");
    store.setEdgeId("e1");
    store.setEdgeLabelDraft("calls");
    expect(store.nodeId()).toBe("n1");
    expect(store.edgeId()).toBe("e1");
    expect(store.edgeLabelDraft()).toBe("calls");
  });
});
