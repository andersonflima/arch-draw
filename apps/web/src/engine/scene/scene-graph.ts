import type { SpatialPoint } from "../spatial/geometry";

export type SceneNode = Readonly<{
  id: string;
  parentId?: string;
  position: SpatialPoint;
}>;

export type SceneGraphOptions<TNode extends SceneNode> = Readonly<{
  isCollapsedContainer: (node: TNode) => boolean;
  rendersAsContainer: (node: TNode) => boolean;
}>;

export class SceneGraph<TNode extends SceneNode> {
  private readonly nodeById = new Map<string, TNode>();
  private readonly indexById = new Map<string, number>();
  private readonly childrenByParentId = new Map<string, readonly TNode[]>();
  private readonly absolutePositionCache = new Map<string, SpatialPoint>();
  private readonly descendantIdsCache = new Map<string, readonly string[]>();
  private readonly hierarchyDepthCache = new Map<string, number>();
  private readonly collapsedAncestorCache = new Map<string, boolean>();
  private readonly nearestCollapsedAncestorCache = new Map<string, TNode | null>();
  private readonly openAncestorContainerIdsCache = new Map<string, readonly string[]>();

  constructor(
    private readonly nodes: readonly TNode[],
    private readonly options: SceneGraphOptions<TNode>
  ) {
    const mutableChildrenByParentId = new Map<string, TNode[]>();

    for (const [index, node] of nodes.entries()) {
      this.nodeById.set(node.id, node);
      this.indexById.set(node.id, index);
      if (!node.parentId) continue;

      const children = mutableChildrenByParentId.get(node.parentId) ?? [];
      children.push(node);
      mutableChildrenByParentId.set(node.parentId, children);
    }

    for (const [parentId, children] of mutableChildrenByParentId.entries()) {
      this.childrenByParentId.set(parentId, children);
    }
  }

  getNode(nodeId: string): TNode | null {
    return this.nodeById.get(nodeId) ?? null;
  }

  getIndex(nodeId: string): number {
    return this.indexById.get(nodeId) ?? -1;
  }

  getChildren(parentId: string): readonly TNode[] {
    return this.childrenByParentId.get(parentId) ?? [];
  }

  getAbsolutePosition(node: TNode): SpatialPoint {
    const cached = this.absolutePositionCache.get(node.id);
    if (cached) return cached;

    if (!node.parentId) {
      this.absolutePositionCache.set(node.id, node.position);
      return node.position;
    }

    const parent = this.getNode(node.parentId);
    if (!parent) {
      this.absolutePositionCache.set(node.id, node.position);
      return node.position;
    }

    const parentPosition = this.getAbsolutePosition(parent);
    const position = {
      x: parentPosition.x + node.position.x,
      y: parentPosition.y + node.position.y
    };
    this.absolutePositionCache.set(node.id, position);
    return position;
  }

  getDescendantIds(nodeId: string): readonly string[] {
    const cached = this.descendantIdsCache.get(nodeId);
    if (cached) return cached;

    const descendants: string[] = [];
    const stack = [...this.getChildren(nodeId)];
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) continue;
      descendants.push(current.id);
      for (const child of this.getChildren(current.id)) {
        stack.push(child);
      }
    }

    this.descendantIdsCache.set(nodeId, descendants);
    return descendants;
  }

  getHierarchyDepth(node: TNode): number {
    const cached = this.hierarchyDepthCache.get(node.id);
    if (cached !== undefined) return cached;

    let depth = 0;
    let currentParentId = node.parentId;
    while (currentParentId) {
      const parent = this.getNode(currentParentId);
      if (!parent) break;
      depth += 1;
      currentParentId = parent.parentId;
    }

    this.hierarchyDepthCache.set(node.id, depth);
    return depth;
  }

  hasCollapsedContainerAncestor(node: TNode): boolean {
    const cached = this.collapsedAncestorCache.get(node.id);
    if (cached !== undefined) return cached;

    let currentParentId = node.parentId;
    while (currentParentId) {
      const parent = this.getNode(currentParentId);
      if (!parent) {
        this.collapsedAncestorCache.set(node.id, false);
        return false;
      }
      if (this.options.isCollapsedContainer(parent)) {
        this.collapsedAncestorCache.set(node.id, true);
        return true;
      }
      currentParentId = parent.parentId;
    }

    this.collapsedAncestorCache.set(node.id, false);
    return false;
  }

  getNearestCollapsedContainerAncestor(node: TNode): TNode | null {
    if (this.nearestCollapsedAncestorCache.has(node.id)) {
      return this.nearestCollapsedAncestorCache.get(node.id) ?? null;
    }

    let currentParentId = node.parentId;
    while (currentParentId) {
      const parent = this.getNode(currentParentId);
      if (!parent) {
        this.nearestCollapsedAncestorCache.set(node.id, null);
        return null;
      }
      if (this.options.isCollapsedContainer(parent)) {
        this.nearestCollapsedAncestorCache.set(node.id, parent);
        return parent;
      }
      currentParentId = parent.parentId;
    }

    this.nearestCollapsedAncestorCache.set(node.id, null);
    return null;
  }

  getOpenAncestorContainerIds(nodeId: string): readonly string[] {
    const cached = this.openAncestorContainerIdsCache.get(nodeId);
    if (cached) return cached;

    const ids: string[] = [];
    let currentParentId = this.getNode(nodeId)?.parentId;
    while (currentParentId) {
      const parent = this.getNode(currentParentId);
      if (!parent) break;
      if (this.options.rendersAsContainer(parent)) ids.push(parent.id);
      currentParentId = parent.parentId;
    }

    this.openAncestorContainerIdsCache.set(nodeId, ids);
    return ids;
  }
}

export const createSceneGraph = <TNode extends SceneNode>(
  nodes: readonly TNode[],
  options: SceneGraphOptions<TNode>
): SceneGraph<TNode> => new SceneGraph(nodes, options);
