import type { ArchitectureEdge, ArchitectureNode } from "@arch-draw/domain";
import type { SceneEdge, SceneLayer, SceneModel, SceneNode } from "./scene-model.js";

export interface SceneBuildInput<Node extends ArchitectureNode = ArchitectureNode> {
  readonly nodes: readonly Node[];
  readonly edges: readonly ArchitectureEdge[];
  /** Decides whether a node paints on the container layer. Injected so the scene
   * builder stays free of the editor's kind catalog. */
  readonly isContainer: (node: Node) => boolean;
}

interface ResolvedGeometry {
  readonly x: number;
  readonly y: number;
  readonly depth: number;
}

/**
 * Build the paint-ordered scene from editor nodes and edges.
 *
 * Ordering rule: nodes are sorted by their explicit `zOrder` (persisted since
 * document v2), falling back to source order for nodes that predate it and as a
 * stable tiebreak. This is the single place stacking order is resolved, so a
 * renderer can paint `scene.nodes` front-to-back without any hierarchy logic.
 */
export const buildSceneModel = <Node extends ArchitectureNode>(
  input: SceneBuildInput<Node>
): SceneModel => {
  const byId = new Map(input.nodes.map((node) => [node.id, node] as const));

  const ordered = input.nodes
    .map((node, index) => ({ scene: toSceneNode(node, index, input.isContainer(node), byId), index }))
    .sort((a, b) => a.scene.zOrder - b.scene.zOrder || a.index - b.index)
    .map((entry) => entry.scene);

  const containers = ordered.filter((node) => node.layer === "container");
  const leaves = ordered.filter((node) => node.layer === "leaf");
  const edges = input.edges.map(toSceneEdge);

  return { nodes: ordered, containers, leaves, edges };
};

const toSceneNode = <Node extends ArchitectureNode>(
  node: Node,
  index: number,
  isContainer: boolean,
  byId: ReadonlyMap<string, Node>
): SceneNode => {
  const geometry = resolveGeometry(node, byId);
  const layer: SceneLayer = isContainer ? "container" : "leaf";
  return {
    id: node.id,
    layer,
    depth: geometry.depth,
    zOrder: node.zOrder ?? index,
    x: geometry.x,
    y: geometry.y,
    width: node.size.width,
    height: node.size.height
  };
};

/** Resolve absolute position and depth by walking the parent chain. Guards
 * against cycles so a malformed document can never spin forever. */
const resolveGeometry = <Node extends ArchitectureNode>(
  node: Node,
  byId: ReadonlyMap<string, Node>
): ResolvedGeometry => {
  let x = node.position.x;
  let y = node.position.y;
  let depth = 0;
  const seen = new Set<string>([node.id]);
  let parentId = node.parentId;

  while (parentId && !seen.has(parentId)) {
    const parent = byId.get(parentId);
    if (!parent) break;
    x += parent.position.x;
    y += parent.position.y;
    depth += 1;
    seen.add(parentId);
    parentId = parent.parentId;
  }

  return { x, y, depth };
};

const toSceneEdge = (edge: ArchitectureEdge): SceneEdge => ({
  id: edge.id,
  from: edge.from,
  to: edge.to
});
