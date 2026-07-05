import type { ArchitectureNode } from "@arch-draw/domain";
import { describe, expect, it } from "vitest";
import { buildSceneModel } from "./scene-builder";

const node = (id: string, patch: Partial<ArchitectureNode> = {}): ArchitectureNode => ({
  id,
  kind: "service",
  label: id,
  position: { x: 0, y: 0 },
  size: { width: 160, height: 96 },
  color: "#fff",
  ...patch
});

const isContainer = (n: ArchitectureNode): boolean => n.kind === "group-container";

describe("buildSceneModel", () => {
  it("resolves absolute position and depth through the parent chain", () => {
    const scene = buildSceneModel({
      nodes: [
        node("root", { kind: "group-container", position: { x: 100, y: 50 } }),
        node("mid", { kind: "group-container", parentId: "root", position: { x: 10, y: 20 } }),
        node("leaf", { parentId: "mid", position: { x: 5, y: 5 } })
      ],
      edges: [],
      isContainer
    });

    const leaf = scene.nodes.find((n) => n.id === "leaf");
    expect(leaf).toMatchObject({ x: 115, y: 75, depth: 2, layer: "leaf" });
    expect(scene.nodes.find((n) => n.id === "mid")).toMatchObject({ depth: 1, layer: "container" });
  });

  it("orders nodes by explicit zOrder ascending", () => {
    const scene = buildSceneModel({
      nodes: [node("a", { zOrder: 30 }), node("b", { zOrder: 10 }), node("c", { zOrder: 20 })],
      edges: [],
      isContainer
    });

    expect(scene.nodes.map((n) => n.id)).toEqual(["b", "c", "a"]);
  });

  it("falls back to source order when no node has an explicit zOrder", () => {
    const scene = buildSceneModel({
      nodes: [node("first"), node("second"), node("third")],
      edges: [],
      isContainer
    });

    expect(scene.nodes.map((n) => n.id)).toEqual(["first", "second", "third"]);
    expect(scene.nodes.map((n) => n.zOrder)).toEqual([0, 1, 2]);
  });

  it("keeps source order as a stable tiebreak for equal zOrder", () => {
    const scene = buildSceneModel({
      nodes: [node("a", { zOrder: 5 }), node("b", { zOrder: 5 }), node("c", { zOrder: 5 })],
      edges: [],
      isContainer
    });

    expect(scene.nodes.map((n) => n.id)).toEqual(["a", "b", "c"]);
  });

  it("partitions containers and leaves while preserving paint order", () => {
    const scene = buildSceneModel({
      nodes: [
        node("box", { kind: "group-container", zOrder: 1 }),
        node("svc", { zOrder: 2 }),
        node("box2", { kind: "group-container", zOrder: 3 })
      ],
      edges: [],
      isContainer
    });

    expect(scene.containers.map((n) => n.id)).toEqual(["box", "box2"]);
    expect(scene.leaves.map((n) => n.id)).toEqual(["svc"]);
  });

  it("maps edges and does not hang on a malformed parent cycle", () => {
    const scene = buildSceneModel({
      nodes: [
        node("x", { parentId: "y" }),
        node("y", { parentId: "x" })
      ],
      edges: [{ id: "e1", from: "x", to: "y" }],
      isContainer
    });

    expect(scene.edges).toEqual([{ id: "e1", from: "x", to: "y" }]);
    expect(scene.nodes).toHaveLength(2);
  });
});
