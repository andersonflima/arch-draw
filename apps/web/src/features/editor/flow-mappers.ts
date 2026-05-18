import type {
  ArchitectureDocument,
  ArchitectureEdge,
  ArchitectureEdgeStyle,
  ArchitectureNode
} from "@arch-draw/domain";

export type CanvasNode = ArchitectureNode;

export type CanvasEdge = ArchitectureEdge & Readonly<{
  style: ArchitectureEdgeStyle;
}>;

export const toCanvasNodes = (
  architecture: ArchitectureDocument
): CanvasNode[] => architecture.nodes.map((node) => ({ ...node }));

export const toCanvasEdges = (architecture: ArchitectureDocument): CanvasEdge[] =>
  architecture.edges.map((edge) => ({
    ...edge,
    style: normalizeEdgeStyle(edge.style)
  }));

export const toArchitectureDocument = (
  architecture: ArchitectureDocument,
  nodes: readonly CanvasNode[],
  edges: readonly CanvasEdge[]
): ArchitectureDocument => ({
  ...architecture,
  nodes: nodes.map((node) => ({ ...node })),
  edges: edges.map(toArchitectureEdge)
});

const toArchitectureEdge = (edge: CanvasEdge): ArchitectureEdge => ({
  id: edge.id,
  from: edge.from,
  to: edge.to,
  sourcePort: edge.sourcePort,
  targetPort: edge.targetPort,
  label: edge.label,
  style: normalizeEdgeStyle(edge.style)
});

export const normalizeEdgeStyle = (
  style: Partial<ArchitectureEdgeStyle> | undefined
): ArchitectureEdgeStyle => ({
  path: normalizeEdgePath(style?.path),
  line: style?.line ?? "solid",
  color: style?.color ?? "#111827",
  animated: style?.animated ?? false,
  bidirectional: style?.bidirectional ?? false
});

const normalizeEdgePath = (path: unknown): ArchitectureEdgeStyle["path"] => {
  if (path === "smoothstep" || path === "step" || path === "straight") return "smoothstep";
  return "smoothstep";
};
