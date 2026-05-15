import type {
  ArchitectureDocument,
  ArchitectureEdge,
  ArchitectureEdgeStyle,
  ArchitectureNode
} from "@arch-draw/domain";
import type { Edge, Node } from "@xyflow/react";
import type { CSSProperties } from "react";
import { isContainerNodeKind } from "./node-catalog";

export type FlowNodeData = ArchitectureNode & Record<string, unknown>;
export type FlowEdgeData = ArchitectureEdgeStyle & Record<string, unknown>;

export const toFlowNodes = (
  architecture: ArchitectureDocument
): Node<FlowNodeData>[] =>
  architecture.nodes.map((node) => ({
    id: node.id,
    type: "architectureNode",
    position: node.position,
    parentId: node.parentId,
    data: { ...node },
    width: node.size.width,
    height: node.size.height,
    style: {
      width: node.size.width,
      height: node.size.height,
      zIndex: isContainerNodeKind(node.kind) ? 0 : 1
    }
  }));

export const toFlowEdges = (architecture: ArchitectureDocument): Edge<FlowEdgeData>[] =>
  architecture.edges.map((edge) => {
    const style = normalizeEdgeStyle(edge.style);

    return {
      id: edge.id,
      source: edge.from,
      target: edge.to,
      label: edge.label,
      animated: style.animated,
      type: style.path,
      data: style,
      style: toEdgeCssStyle(style)
    };
  });

export const toArchitectureDocument = (
  architecture: ArchitectureDocument,
  nodes: readonly Node<FlowNodeData>[],
  edges: readonly Edge<FlowEdgeData>[]
): ArchitectureDocument => ({
  ...architecture,
  nodes: nodes.map(toArchitectureNode),
  edges: edges.map(toArchitectureEdge)
});

const toArchitectureNode = (node: Node<FlowNodeData>): ArchitectureNode => ({
  id: node.id,
  kind: node.data.kind,
  label: node.data.label,
  parentId: node.parentId,
  color: node.data.color,
  mermaidSource: node.data.mermaidSource,
  position: node.position,
  size: {
    width: node.measured?.width ?? node.width ?? node.data.size.width,
    height: node.measured?.height ?? node.height ?? node.data.size.height
  }
});

const toArchitectureEdge = (edge: Edge<FlowEdgeData>): ArchitectureEdge => ({
  id: edge.id,
  from: edge.source,
  to: edge.target,
  label: typeof edge.label === "string" ? edge.label : undefined,
  style: normalizeEdgeStyle(edge.data as Partial<ArchitectureEdgeStyle> | undefined)
});

export const normalizeEdgeStyle = (
  style: Partial<ArchitectureEdgeStyle> | undefined
): ArchitectureEdgeStyle => ({
  path: style?.path ?? "smoothstep",
  line: style?.line ?? "solid",
  color: style?.color ?? "#111827",
  animated: style?.animated ?? false
});

export const toEdgeCssStyle = (style: ArchitectureEdgeStyle): CSSProperties => ({
  stroke: style.color,
  strokeWidth: 2.2,
  strokeDasharray: style.line === "solid" ? undefined : style.line === "dashed" ? "8 6" : "2 6"
});
