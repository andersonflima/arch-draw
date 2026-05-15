import type {
  ArchitectureEdgeLineStyle,
  ArchitectureEdgePath,
  ArchitectureNodeKind
} from "@arch-draw/domain";
import type { Edge, Node } from "@xyflow/react";
import { Trash2 } from "lucide-react";
import {
  normalizeEdgeStyle,
  toEdgeCssStyle,
  type FlowEdgeData,
  type FlowNodeData
} from "./flow-mappers";
import { getNodeKindLabel, isContainerNodeKind, nodeCatalog } from "./node-catalog";

type InspectorProps = Readonly<{
  selectedNode: Node<FlowNodeData> | null;
  selectedEdge: Edge<FlowEdgeData> | null;
  onUpdateNode: (id: string, data: Partial<FlowNodeData>) => void;
  onDeleteNode: (id: string) => void;
  onUpdateEdge: (id: string, edge: Partial<Edge<FlowEdgeData>>) => void;
  onDeleteEdge: (id: string) => void;
}>;

export const Inspector = ({
  selectedNode,
  selectedEdge,
  onUpdateNode,
  onDeleteNode,
  onUpdateEdge,
  onDeleteEdge
}: InspectorProps) => (
  <aside className="inspector" aria-label="Inspector">
    <div className="panel-heading">
      <div>
        <span>Propriedades</span>
        <small>{selectedNode ? "Nó selecionado" : selectedEdge ? "Linha selecionada" : "Selecione algo"}</small>
      </div>
    </div>
    {selectedNode ? (
      <NodeProperties
        selectedNode={selectedNode}
        onUpdateNode={onUpdateNode}
        onDeleteNode={onDeleteNode}
      />
    ) : selectedEdge ? (
      <EdgeProperties
        selectedEdge={selectedEdge}
        onUpdateEdge={onUpdateEdge}
        onDeleteEdge={onDeleteEdge}
      />
    ) : (
      <p className="muted-copy">Use os blocos, conecte nós ou aplique Mermaid para compor a arquitetura.</p>
    )}
  </aside>
);

type NodePropertiesProps = Readonly<{
  selectedNode: Node<FlowNodeData>;
  onUpdateNode: (id: string, data: Partial<FlowNodeData>) => void;
  onDeleteNode: (id: string) => void;
}>;

const NodeProperties = ({
  selectedNode,
  onUpdateNode,
  onDeleteNode
}: NodePropertiesProps) => {
  const isContainer = isContainerNodeKind(selectedNode.data.kind);

  return (
    <div className="property-stack">
      <label>
        {isContainer ? "Nome do container" : "Nome"}
        <input
          value={selectedNode.data.label}
          onChange={(event) => onUpdateNode(selectedNode.id, { label: event.target.value })}
        />
      </label>
      <label>
        Tipo
        <select
          value={selectedNode.data.kind}
          onChange={(event) =>
            onUpdateNode(selectedNode.id, { kind: event.target.value as ArchitectureNodeKind })
          }
        >
          {nodeCatalog.map((template) => (
            <option key={template.kind} value={template.kind}>
              {getNodeKindLabel(template.kind)}
            </option>
          ))}
        </select>
      </label>
      <label>
        Cor
        <input
          type="color"
          value={selectedNode.data.color}
          onChange={(event) => onUpdateNode(selectedNode.id, { color: event.target.value })}
        />
      </label>
      <button className="danger-action" type="button" onClick={() => onDeleteNode(selectedNode.id)}>
        <Trash2 size={16} />
        Remover nó
      </button>
    </div>
  );
};

type EdgePropertiesProps = Readonly<{
  selectedEdge: Edge<FlowEdgeData>;
  onUpdateEdge: (id: string, edge: Partial<Edge<FlowEdgeData>>) => void;
  onDeleteEdge: (id: string) => void;
}>;

const EdgeProperties = ({
  selectedEdge,
  onUpdateEdge,
  onDeleteEdge
}: EdgePropertiesProps) => {
  const edgeStyle = normalizeEdgeStyle(selectedEdge.data);

  const updateStyle = (next: Partial<FlowEdgeData>) => {
    const data = normalizeEdgeStyle({ ...edgeStyle, ...next });
    onUpdateEdge(selectedEdge.id, {
      animated: data.animated,
      data,
      style: toEdgeCssStyle(data),
      type: data.path
    });
  };

  return (
    <div className="property-stack">
      <label>
        Rótulo
        <input
          value={typeof selectedEdge.label === "string" ? selectedEdge.label : ""}
          onChange={(event) =>
            onUpdateEdge(selectedEdge.id, { label: event.target.value || undefined })
          }
        />
      </label>
      <label>
        Caminho
        <select
          value={edgeStyle.path}
          onChange={(event) => updateStyle({ path: event.target.value as ArchitectureEdgePath })}
        >
          <option value="smoothstep">Cotovelada suave</option>
          <option value="step">Cotovelada</option>
          <option value="straight">Reta</option>
          <option value="bezier">Curva</option>
        </select>
      </label>
      <label>
        Traço
        <select
          value={edgeStyle.line}
          onChange={(event) =>
            updateStyle({ line: event.target.value as ArchitectureEdgeLineStyle })
          }
        >
          <option value="solid">Contínua</option>
          <option value="dashed">Tracejada</option>
          <option value="dotted">Pontilhada</option>
        </select>
      </label>
      <label>
        Cor
        <input
          type="color"
          value={edgeStyle.color}
          onChange={(event) => updateStyle({ color: event.target.value })}
        />
      </label>
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={edgeStyle.animated}
          onChange={(event) => updateStyle({ animated: event.target.checked })}
        />
        Animar fluxo
      </label>
      <button className="danger-action" type="button" onClick={() => onDeleteEdge(selectedEdge.id)}>
        <Trash2 size={16} />
        Remover linha
      </button>
    </div>
  );
};
