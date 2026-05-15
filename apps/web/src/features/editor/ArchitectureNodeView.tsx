import { Handle, NodeResizer, Position, type NodeProps } from "@xyflow/react";
import type { FlowNodeData } from "./flow-mappers";
import { getNodeIcon } from "./node-icons";
import { getNodeKindLabel, getNodeVisualGroup, isContainerNodeKind } from "./node-catalog";

export const ArchitectureNodeView = ({ data, selected }: NodeProps) => {
  const kind = data.kind as FlowNodeData["kind"];
  const Icon = getNodeIcon(kind);
  const visualGroup = getNodeVisualGroup(kind);
  const isContainer = isContainerNodeKind(kind);
  const minWidth = isContainer ? 260 : 140;
  const minHeight = isContainer ? 180 : 72;

  return (
    <div
      className={`architecture-node architecture-node--${visualGroup} architecture-node--${kind}${isContainer ? " architecture-node--container" : ""}${selected ? " is-selected" : ""}`}
      style={{ background: data.color as string }}
    >
      <NodeResizer
        color="#111827"
        handleClassName="architecture-resize-handle"
        isVisible={selected}
        lineClassName="architecture-resize-line"
        minHeight={minHeight}
        minWidth={minWidth}
      />
      <Handle type="target" position={Position.Left} />
      <div className="architecture-node__header">
        <Icon size={16} />
        <span>{getNodeKindLabel(kind)}</span>
      </div>
      <strong>{data.label as string}</strong>
      <Handle type="source" position={Position.Right} />
    </div>
  );
};
