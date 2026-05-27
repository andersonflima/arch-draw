import { describe, expect, it } from "vitest";
import { createSceneGraph, type SceneNode } from "./scene-graph";

type TestNode = SceneNode & Readonly<{
  collapsed?: boolean;
  container?: boolean;
}>;

const createGraph = (nodes: readonly TestNode[]) =>
  createSceneGraph(nodes, {
    isCollapsedContainer: (node) => Boolean(node.container && node.collapsed),
    rendersAsContainer: (node) => Boolean(node.container && !node.collapsed)
  });

describe("scene graph", () => {
  it("indexes nodes and children", () => {
    const graph = createGraph([
      { id: "root", position: { x: 10, y: 20 }, container: true },
      { id: "child", parentId: "root", position: { x: 5, y: 6 } }
    ]);

    expect(graph.getIndex("child")).toBe(1);
    expect(graph.getChildren("root").map((node) => node.id)).toEqual(["child"]);
  });

  it("computes absolute positions and descendants", () => {
    const graph = createGraph([
      { id: "root", position: { x: 10, y: 20 }, container: true },
      { id: "child", parentId: "root", position: { x: 5, y: 6 }, container: true },
      { id: "leaf", parentId: "child", position: { x: 1, y: 2 } }
    ]);

    expect(graph.getAbsolutePosition(graph.getNode("leaf")!)).toEqual({ x: 16, y: 28 });
    expect(graph.getDescendantIds("root").sort()).toEqual(["child", "leaf"]);
  });

  it("resolves collapsed and open ancestors", () => {
    const collapsedGraph = createGraph([
      { id: "root", position: { x: 0, y: 0 }, container: true, collapsed: true },
      { id: "leaf", parentId: "root", position: { x: 1, y: 1 } }
    ]);
    const openGraph = createGraph([
      { id: "root", position: { x: 0, y: 0 }, container: true },
      { id: "leaf", parentId: "root", position: { x: 1, y: 1 } }
    ]);

    expect(collapsedGraph.hasCollapsedContainerAncestor(collapsedGraph.getNode("leaf")!)).toBe(true);
    expect(collapsedGraph.getNearestCollapsedContainerAncestor(collapsedGraph.getNode("leaf")!)?.id).toBe("root");
    expect(openGraph.getOpenAncestorContainerIds("leaf")).toEqual(["root"]);
  });
});
