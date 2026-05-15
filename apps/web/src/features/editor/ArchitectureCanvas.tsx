import { useCallback, useMemo } from "react";
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange
} from "@xyflow/react";
import type { ArchitectureNode } from "@arch-draw/domain";
import { ArchitectureNodeView } from "./ArchitectureNodeView";
import { toEdgeCssStyle, type FlowEdgeData, type FlowNodeData } from "./flow-mappers";
import { getDefaultNodeSize, isContainerNodeKind, type NodeTemplate } from "./node-catalog";

type ArchitectureCanvasProps = Readonly<{
  nodes: Node<FlowNodeData>[];
  edges: Edge<FlowEdgeData>[];
  onNodesChange: (nodes: Node<FlowNodeData>[]) => void;
  onEdgesChange: (edges: Edge<FlowEdgeData>[]) => void;
  onSelectNode: (nodeId: string | null) => void;
  onSelectEdge: (edgeId: string | null) => void;
}>;

export const ArchitectureCanvas = ({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onSelectNode,
  onSelectEdge
}: ArchitectureCanvasProps) => {
  const { screenToFlowPosition } = useReactFlow();
  const nodeTypes = useMemo(() => ({ architectureNode: ArchitectureNodeView }), []);

  const addNode = useCallback(
    (template: NodeTemplate, position = { x: 160, y: 160 }) => {
      const id = `${template.kind}-${crypto.randomUUID()}`;
      const size = getDefaultNodeSize(template.kind);
      const parent = findContainingNode(position, size, nodes);
      const parentPosition = parent ? getAbsolutePosition(parent, nodes) : null;
      const nodePosition = parentPosition
        ? {
            x: position.x - parentPosition.x,
            y: position.y - parentPosition.y
          }
        : position;
      const data: ArchitectureNode = {
        id,
        kind: template.kind,
        label: template.label,
        parentId: parent?.id,
        color: template.color,
        position: nodePosition,
        size
      };

      onNodesChange(sortNodes([
        ...nodes,
        {
          id,
          type: "architectureNode",
          parentId: parent?.id,
          position: nodePosition,
          data: data as FlowNodeData,
          style: {
            width: size.width,
            height: size.height,
            zIndex: isContainerNodeKind(template.kind) ? 0 : 1
          }
        }
      ]));
    },
    [nodes, onNodesChange]
  );

  return (
    <main
      className="canvas-shell"
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDrop={(event) => {
        event.preventDefault();
        const rawTemplate = event.dataTransfer.getData("application/arch-draw-node");
        if (!rawTemplate) return;

        const template = JSON.parse(rawTemplate) as NodeTemplate;
        addNode(template, screenToFlowPosition({ x: event.clientX, y: event.clientY }));
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        onNodeClick={(_, node) => {
          onSelectNode(node.id);
          onSelectEdge(null);
        }}
        onEdgeClick={(_, edge) => {
          onSelectNode(null);
          onSelectEdge(edge.id);
        }}
        onPaneClick={() => {
          onSelectNode(null);
          onSelectEdge(null);
        }}
        onNodesChange={(changes: NodeChange<Node<FlowNodeData>>[]) =>
          onNodesChange(sortNodes(applyNodeChanges(changes, nodes)))
        }
        onNodeDragStop={(_, node) => {
          const nextNodes = attachNodeToContainer(node as Node<FlowNodeData>, nodes);
          onNodesChange(sortNodes(nextNodes));
        }}
        onEdgesChange={(changes: EdgeChange<Edge<FlowEdgeData>>[]) =>
          onEdgesChange(applyEdgeChanges(changes, edges))
        }
        onConnect={(connection: Connection) =>
          onEdgesChange(
            addEdge(
              {
                ...connection,
                id: `edge-${connection.source}-${connection.target}-${crypto.randomUUID()}`,
                type: "smoothstep",
                data: {
                  path: "smoothstep",
                  line: "solid",
                  color: "#111827",
                  animated: false
                },
                style: toEdgeCssStyle({
                  path: "smoothstep",
                  line: "solid",
                  color: "#111827",
                  animated: false
                })
              },
              edges
            )
          )
        }
      >
        <Background color="#d1d5db" gap={24} />
        <Controls />
        <MiniMap pannable zoomable nodeStrokeWidth={3} />
      </ReactFlow>
    </main>
  );
};

export { nodeCatalog } from "./node-catalog";

const attachNodeToContainer = (
  draggedNode: Node<FlowNodeData>,
  nodes: Node<FlowNodeData>[]
): Node<FlowNodeData>[] => {
  const draggedAbsolutePosition = getAbsolutePosition(draggedNode, nodes);
  const unavailableTargetIds = new Set([draggedNode.id, ...getDescendantIds(draggedNode.id, nodes)]);
  const target = findContainingNode(
    draggedAbsolutePosition,
    getNodeSize(draggedNode),
    nodes.filter((node) => !unavailableTargetIds.has(node.id))
  );
  const targetAbsolutePosition = target ? getAbsolutePosition(target, nodes) : null;
  const nextPosition = targetAbsolutePosition
    ? {
        x: draggedAbsolutePosition.x - targetAbsolutePosition.x,
        y: draggedAbsolutePosition.y - targetAbsolutePosition.y
      }
    : draggedAbsolutePosition;

  return nodes.map((node) =>
    node.id === draggedNode.id
      ? {
          ...node,
          parentId: target?.id,
          position: nextPosition,
          data: {
            ...node.data,
            parentId: target?.id,
            position: nextPosition
          }
        }
      : node
  );
};

const findContainingNode = (
  position: { x: number; y: number },
  size: { width: number; height: number },
  nodes: Node<FlowNodeData>[]
): Node<FlowNodeData> | null => {
  const center = {
    x: position.x + size.width / 2,
    y: position.y + size.height / 2
  };

  return (
    nodes
      .filter((node) => isContainerNodeKind(node.data.kind))
      .filter((node) => containsPoint(node, nodes, center))
      .sort((a, b) => area(getNodeSize(a)) - area(getNodeSize(b)))[0] ?? null
  );
};

const containsPoint = (
  node: Node<FlowNodeData>,
  nodes: Node<FlowNodeData>[],
  point: { x: number; y: number }
): boolean => {
  const position = getAbsolutePosition(node, nodes);
  const size = getNodeSize(node);

  return (
    point.x >= position.x &&
    point.x <= position.x + size.width &&
    point.y >= position.y &&
    point.y <= position.y + size.height
  );
};

const getAbsolutePosition = (
  node: Node<FlowNodeData>,
  nodes: Node<FlowNodeData>[]
): { x: number; y: number } => {
  if (!node.parentId) return node.position;
  const parent = nodes.find((candidate) => candidate.id === node.parentId);
  if (!parent) return node.position;
  const parentPosition = getAbsolutePosition(parent, nodes);

  return {
    x: parentPosition.x + node.position.x,
    y: parentPosition.y + node.position.y
  };
};

const getNodeSize = (node: Node<FlowNodeData>): { width: number; height: number } => ({
  width: node.measured?.width ?? node.width ?? node.data.size.width,
  height: node.measured?.height ?? node.height ?? node.data.size.height
});

const area = (size: { width: number; height: number }): number => size.width * size.height;

const getDescendantIds = (
  nodeId: string,
  nodes: Node<FlowNodeData>[]
): readonly string[] => {
  const directChildren = nodes.filter((node) => node.parentId === nodeId);

  return directChildren.flatMap((child) => [
    child.id,
    ...getDescendantIds(child.id, nodes)
  ]);
};

const sortNodes = (nodes: Node<FlowNodeData>[]): Node<FlowNodeData>[] =>
  [...nodes].sort((a, b) => Number(isContainerNodeKind(b.data.kind)) - Number(isContainerNodeKind(a.data.kind)));
