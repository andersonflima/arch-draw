export type BidirectionalPairEdge = Readonly<{
  id: string;
  from: string;
  to: string;
}>;

export const getBidirectionalPairPrimaryEdge = <T extends BidirectionalPairEdge>(
  edges: readonly T[],
  from: string,
  to: string
): T | null => {
  return edges.find((edge) =>
    (edge.from === from && edge.to === to)
    || (edge.from === to && edge.to === from)
  ) ?? null;
};
