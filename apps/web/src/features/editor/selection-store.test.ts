import { describe, expect, it } from "vitest";
import { SelectionStore } from "./selection-store";

describe("SelectionStore", () => {
  it("starts empty", () => {
    const store = new SelectionStore();
    expect(store.ids()).toEqual([]);
    expect(store.primaryId()).toBeNull();
    expect(store.has("n1")).toBe(false);
  });

  it("tracks selected ids and answers membership", () => {
    const store = new SelectionStore();
    store.setIds(["n1", "n2"]);
    expect(store.ids()).toEqual(["n1", "n2"]);
    expect(store.has("n1")).toBe(true);
    expect(store.has("n2")).toBe(true);
    expect(store.has("n3")).toBe(false);
  });

  it("tracks the primary id independently", () => {
    const store = new SelectionStore();
    store.setPrimaryId("n1");
    expect(store.primaryId()).toBe("n1");
    store.setPrimaryId(null);
    expect(store.primaryId()).toBeNull();
  });

  it("recomputes membership after the id set changes", () => {
    const store = new SelectionStore();
    store.setIds(["n1"]);
    expect(store.has("n1")).toBe(true);
    store.setIds(["n2"]);
    expect(store.has("n1")).toBe(false);
    expect(store.has("n2")).toBe(true);
    store.setIds([]);
    expect(store.has("n2")).toBe(false);
  });
});
