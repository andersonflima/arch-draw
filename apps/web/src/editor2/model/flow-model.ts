import type { ArchitectureDocument, ArchitectureNodeKind } from "@arch-draw/domain";
import { buildSceneModel } from "../../canvas-engine";

/** A node/group resolved to absolute coordinates for the Foblex flow layer. */
export interface FlowNodeVm {
  readonly id: string;
  readonly kind: ArchitectureNodeKind;
  readonly label: string;
  readonly parentId: string | null;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly color: string;
  readonly zOrder: number;
  /** Whether this element can hold an example code snippet. */
  readonly hasCode: boolean;
  readonly codeContent: string;
  readonly codeLanguage: string;
}

export interface FlowEdgeVm {
  readonly id: string;
  readonly from: string;
  readonly to: string;
}

export interface FlowModel {
  readonly groups: readonly FlowNodeVm[];
  readonly nodes: readonly FlowNodeVm[];
  readonly edges: readonly FlowEdgeVm[];
}

export const EMPTY_FLOW_MODEL: FlowModel = { groups: [], nodes: [], edges: [] };

/**
 * Map an ArchitectureDocument to the Foblex view model. Geometry (absolute
 * position, container/leaf partition, paint order) is resolved by the shared,
 * tested scene builder; this layer only enriches it with label/kind/colour.
 */
export const buildFlowModel = (
  document: ArchitectureDocument,
  isContainer: (kind: ArchitectureNodeKind) => boolean,
  isCodeSnippet: (kind: ArchitectureNodeKind) => boolean
): FlowModel => {
  const byId = new Map(document.nodes.map((node) => [node.id, node] as const));
  const scene = buildSceneModel({
    nodes: document.nodes,
    edges: document.edges,
    isContainer: (node) => isContainer(node.kind)
  });

  const toVm = (sceneNode: (typeof scene.nodes)[number]): FlowNodeVm | null => {
    const node = byId.get(sceneNode.id);
    if (!node) return null;
    return {
      id: sceneNode.id,
      kind: node.kind,
      label: node.label,
      parentId: node.parentId ?? null,
      x: sceneNode.x,
      y: sceneNode.y,
      width: sceneNode.width,
      height: sceneNode.height,
      color: node.color,
      zOrder: sceneNode.zOrder,
      hasCode: isCodeSnippet(node.kind),
      codeContent: node.properties?.["codeContent"] ?? "",
      codeLanguage: node.properties?.["codeLanguage"] ?? ""
    };
  };

  const keep = (vm: FlowNodeVm | null): vm is FlowNodeVm => vm !== null;

  return {
    groups: scene.containers.map(toVm).filter(keep),
    nodes: scene.leaves.map(toVm).filter(keep),
    edges: scene.edges.map((edge) => ({ id: edge.id, from: edge.from, to: edge.to }))
  };
};
