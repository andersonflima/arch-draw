import { describe, expect, it } from "vitest";
import { InteractionStore } from "./interaction-store";

describe("InteractionStore", () => {
  it("starts with no active gesture", () => {
    const store = new InteractionStore();
    expect(store.dragState()).toBeNull();
    expect(store.panState()).toBeNull();
    expect(store.resizeState()).toBeNull();
    expect(store.marqueeState()).toBeNull();
    expect(store.connectionDragState()).toBeNull();
    expect(store.resizeEnabledNodeId()).toBeNull();
  });

  it("tracks a node drag gesture and clears it", () => {
    const store = new InteractionStore();
    const drag = { pointerOffsets: new Map([["n1", { x: 4, y: 6 }]]), startPoint: { x: 10, y: 12 }, hasMoved: false };
    store.setDragState(drag);
    expect(store.dragState()).toBe(drag);
    store.setDragState(null);
    expect(store.dragState()).toBeNull();
  });

  it("tracks a marquee selection independently of other gestures", () => {
    const store = new InteractionStore();
    store.setMarqueeState({ start: { x: 0, y: 0 }, current: { x: 50, y: 40 } });
    expect(store.marqueeState()).toEqual({ start: { x: 0, y: 0 }, current: { x: 50, y: 40 } });
    expect(store.dragState()).toBeNull();
  });

  it("tracks a connection drag with its source port", () => {
    const store = new InteractionStore();
    store.setConnectionDragState({ sourceId: "n1", sourcePort: "right", start: { x: 1, y: 2 }, current: { x: 9, y: 8 } });
    expect(store.connectionDragState()?.sourceId).toBe("n1");
    expect(store.connectionDragState()?.sourcePort).toBe("right");
  });

  it("tracks the resize-enabled node id", () => {
    const store = new InteractionStore();
    store.setResizeEnabledNodeId("n2");
    expect(store.resizeEnabledNodeId()).toBe("n2");
    store.setResizeEnabledNodeId(null);
    expect(store.resizeEnabledNodeId()).toBeNull();
  });
});
