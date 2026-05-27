export type SceneEdge = Readonly<{
  id: string;
  from: string;
  to: string;
}>;

export class EdgeGraph<TEdge extends SceneEdge> {
  private readonly edgeById = new Map<string, TEdge>();
  private readonly pairEdges = new Map<string, readonly TEdge[]>();

  constructor(edges: readonly TEdge[]) {
    const mutablePairEdges = new Map<string, TEdge[]>();

    for (const edge of edges) {
      this.edgeById.set(edge.id, edge);
      const pairKey = this.getPairKey(edge.from, edge.to);
      const pair = mutablePairEdges.get(pairKey) ?? [];
      pair.push(edge);
      mutablePairEdges.set(pairKey, pair);
    }

    for (const [pairKey, pair] of mutablePairEdges.entries()) {
      this.pairEdges.set(pairKey, pair);
    }
  }

  getEdge(edgeId: string | null): TEdge | null {
    if (!edgeId) return null;
    return this.edgeById.get(edgeId) ?? null;
  }

  getPairEdges(leftNodeId: string, rightNodeId: string): readonly TEdge[] {
    return this.pairEdges.get(this.getPairKey(leftNodeId, rightNodeId)) ?? [];
  }

  private getPairKey(leftNodeId: string, rightNodeId: string): string {
    return leftNodeId < rightNodeId
      ? `${leftNodeId}\u0000${rightNodeId}`
      : `${rightNodeId}\u0000${leftNodeId}`;
  }
}

export const createEdgeGraph = <TEdge extends SceneEdge>(
  edges: readonly TEdge[]
): EdgeGraph<TEdge> => new EdgeGraph(edges);
