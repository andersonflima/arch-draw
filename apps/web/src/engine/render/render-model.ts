export type LayeredRenderNode = Readonly<{
  id: string;
}>;

export type RenderModel<TNode extends LayeredRenderNode, TEdge> = Readonly<{
  containerNodes: readonly TNode[];
  leafNodes: readonly TNode[];
  edges: readonly TEdge[];
}>;

export const buildRenderModel = <TNode extends LayeredRenderNode, TEdge>(
  nodes: readonly TNode[],
  edges: readonly TEdge[],
  isContainerNode: (node: TNode) => boolean
): RenderModel<TNode, TEdge> => {
  const containerNodes: TNode[] = [];
  const leafNodes: TNode[] = [];

  for (const node of nodes) {
    if (isContainerNode(node)) {
      containerNodes.push(node);
    } else {
      leafNodes.push(node);
    }
  }

  return { containerNodes, leafNodes, edges };
};
