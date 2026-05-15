import { ReactFlowProvider, type Edge, type Node } from "@xyflow/react";
import {
  Download,
  FilePlus2,
  FolderOpen,
  Import,
  Save,
  Share2,
  Trash2
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  architectureFromMermaid,
  type ArchitectureDocument,
  type ArchitectureSharePackage
} from "@arch-draw/domain";
import { api, type ArchitectureSummary } from "./api/client";
import { IconButton } from "./components/IconButton";
import { ArchitectureCanvas } from "./features/editor/ArchitectureCanvas";
import {
  toArchitectureDocument,
  toFlowEdges,
  toFlowNodes,
  type FlowEdgeData,
  type FlowNodeData
} from "./features/editor/flow-mappers";
import { Inspector } from "./features/editor/Inspector";
import { MermaidPanel } from "./features/editor/MermaidPanel";
import { Palette } from "./features/editor/Palette";
import { getDefaultNodeSize, isContainerNodeKind, type NodeTemplate } from "./features/editor/node-catalog";

const DEFAULT_MERMAID_SOURCE = `graph LR
  User["User"] --> Api["API"]
  Api --> Db["SQLite"]`;

export const App = () => {
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [summaries, setSummaries] = useState<readonly ArchitectureSummary[]>([]);
  const [architecture, setArchitecture] = useState<ArchitectureDocument | null>(null);
  const [nodes, setNodes] = useState<Node<FlowNodeData>[]>([]);
  const [edges, setEdges] = useState<Edge<FlowEdgeData>[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [mermaidDraft, setMermaidDraft] = useState("");
  const [status, setStatus] = useState("Inicializando");
  const [error, setError] = useState("");

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId]
  );
  const selectedEdge = useMemo(
    () => edges.find((edge) => edge.id === selectedEdgeId) ?? null,
    [edges, selectedEdgeId]
  );

  const refreshSummaries = useCallback(async () => {
    setSummaries(await api.listArchitectures());
  }, []);

  const loadArchitecture = useCallback(async (id: string) => {
    const loaded = await api.readArchitecture(id);
    setArchitecture(loaded);
    setNodes(toFlowNodes(loaded));
    setEdges(toFlowEdges(loaded));
    setMermaidDraft(loaded.mermaidSource || DEFAULT_MERMAID_SOURCE);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setStatus("Arquitetura carregada");
  }, []);

  useEffect(() => {
    const boot = async () => {
      try {
        const existing = await api.listArchitectures();
        const first = existing[0] ?? (await api.createArchitecture("Arquitetura local"));
        await loadArchitecture(first.id);
        await refreshSummaries();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Falha ao iniciar");
        setStatus("API indisponível");
      }
    };

    void boot();
  }, [loadArchitecture, refreshSummaries]);

  const updateCurrent = (next: ArchitectureDocument) => {
    setArchitecture(next);
    setNodes(toFlowNodes(next));
    setEdges(toFlowEdges(next));
    setMermaidDraft(next.mermaidSource || DEFAULT_MERMAID_SOURCE);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
  };

  const saveCurrent = async () => {
    if (!architecture) return;

    const document = toArchitectureDocument(
      { ...architecture, mermaidSource: mermaidDraft },
      nodes,
      edges
    );
    const saved = await api.saveArchitecture(document);
    updateCurrent(saved);
    await refreshSummaries();
    setStatus("Salvo no SQLite");
  };

  const runSafely = async (operation: () => Promise<void>) => {
    try {
      setError("");
      await operation();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Operação falhou");
    }
  };

  const createArchitecture = () =>
    runSafely(async () => {
      const created = await api.createArchitecture("Nova arquitetura");
      updateCurrent(created);
      await refreshSummaries();
      setStatus("Nova arquitetura criada");
    });

  const deleteCurrent = () =>
    runSafely(async () => {
      if (!architecture) return;
      await api.deleteArchitecture(architecture.id);
      const remaining = await api.listArchitectures();
      setSummaries(remaining);

      if (remaining[0]) {
        await loadArchitecture(remaining[0].id);
      } else {
        const created = await api.createArchitecture("Arquitetura local");
        updateCurrent(created);
        await refreshSummaries();
      }
    });

  const exportCurrent = () =>
    runSafely(async () => {
      if (!architecture) return;
      await saveCurrent();
      const sharePackage = await api.exportArchitecture(architecture.id);
      const blob = new Blob([JSON.stringify(sharePackage, null, 2)], {
        type: "application/json"
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${architecture.title.replaceAll(/\s+/g, "-").toLowerCase()}.archdraw.json`;
      link.click();
      URL.revokeObjectURL(url);
      setStatus("Arquivo de compartilhamento exportado");
    });

  const importArchitecture = (file: File) =>
    runSafely(async () => {
      const text = await file.text();
      const sharePackage = JSON.parse(text) as ArchitectureSharePackage;
      const imported = await api.importArchitecture(sharePackage);
      updateCurrent(imported);
      await refreshSummaries();
      setStatus("Arquitetura importada");
    });

  const applyMermaid = () => {
    if (!architecture) return;
    const next = architectureFromMermaid(architecture, mermaidDraft, new Date().toISOString());
    updateCurrent(next);
    setStatus("Mermaid aplicado ao canvas");
  };

  const addNode = (template: NodeTemplate) => {
    const id = `${template.kind}-${crypto.randomUUID()}`;
    const size = getDefaultNodeSize(template.kind);
    const position = {
      x: 120 + (nodes.length % 3) * 220,
      y: 120 + Math.floor(nodes.length / 3) * 140
    };

    setNodes([
      ...nodes,
      {
        id,
        type: "architectureNode",
        position,
        data: {
          id,
          kind: template.kind,
          label: template.label,
          color: template.color,
          position,
          size
        },
        style: {
          width: size.width,
          height: size.height,
          zIndex: isContainerNodeKind(template.kind) ? 0 : 1
        }
      }
    ]);
  };

  const updateNode = (id: string, data: Partial<FlowNodeData>) => {
    setNodes((current) =>
      current.map((node) => {
        if (node.id !== id) return detachFromNonContainerParent(node, current, id, data);

        const kind = data.kind ?? node.data.kind;
        const size = data.kind ? getSizeForKind(node, kind) : node.data.size;

        return {
          ...node,
          data: {
            ...node.data,
            ...data,
            kind,
            size
          },
          style: {
            ...node.style,
            width: size.width,
            height: size.height,
            zIndex: isContainerNodeKind(kind) ? 0 : 1
          }
        };
      })
    );
  };

  const updateEdge = (id: string, data: Partial<Edge<FlowEdgeData>>) => {
    setEdges((current) =>
      current.map((edge) =>
        edge.id === id
          ? {
              ...edge,
              ...data
            }
          : edge
      )
    );
  };

  const deleteNode = (id: string) => {
    setNodes((current) =>
      current
        .map((node) => (node.parentId === id ? detachNodeFromParent(node, current) : node))
        .filter((node) => node.id !== id)
    );
    setEdges((current) => current.filter((edge) => edge.source !== id && edge.target !== id));
    setSelectedNodeId(null);
  };

  const deleteEdge = (id: string) => {
    setEdges((current) => current.filter((edge) => edge.id !== id));
    setSelectedEdgeId(null);
  };

  return (
    <ReactFlowProvider>
      <div className="app-shell">
        <header className="topbar">
          <div className="brand-lockup">
            <Share2 size={24} />
            <div>
              <strong>Arch Draw</strong>
              <span>{status}</span>
            </div>
          </div>
          {architecture ? (
            <input
              className="title-input"
              value={architecture.title}
              onChange={(event) =>
                setArchitecture({ ...architecture, title: event.target.value })
              }
            />
          ) : null}
          <div className="toolbar">
            <IconButton label="Nova arquitetura" icon={<FilePlus2 size={18} />} onClick={createArchitecture} />
            <IconButton label="Salvar" icon={<Save size={18} />} onClick={() => void runSafely(saveCurrent)} />
            <IconButton label="Exportar" icon={<Download size={18} />} onClick={exportCurrent} />
            <IconButton label="Importar" icon={<Import size={18} />} onClick={() => importInputRef.current?.click()} />
            <IconButton label="Remover arquitetura" icon={<Trash2 size={18} />} onClick={deleteCurrent} />
          </div>
          <input
            ref={importInputRef}
            hidden
            type="file"
            accept="application/json,.json,.archdraw"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importArchitecture(file);
              event.currentTarget.value = "";
            }}
          />
        </header>
        <div className="workspace">
          <nav className="sidebar">
            <div className="panel-heading">
              <div>
                <span>Arquivos</span>
                <small>{summaries.length} salvos localmente</small>
              </div>
              <FolderOpen size={17} />
            </div>
            <div className="file-list">
              {summaries.map((summary) => (
                <button
                  className={summary.id === architecture?.id ? "file-item is-active" : "file-item"}
                  key={summary.id}
                  type="button"
                  onClick={() => void runSafely(() => loadArchitecture(summary.id))}
                >
                  <strong>{summary.title}</strong>
                  <span>
                    {summary.nodeCount} nós, {summary.edgeCount} conexões
                  </span>
                </button>
              ))}
            </div>
          </nav>
          <Palette onAdd={addNode} />
          <ArchitectureCanvas
            nodes={nodes}
            edges={edges}
            onNodesChange={setNodes}
            onEdgesChange={setEdges}
            onSelectNode={setSelectedNodeId}
            onSelectEdge={setSelectedEdgeId}
          />
          <div className="right-rail">
            <Inspector
              selectedNode={selectedNode}
              selectedEdge={selectedEdge}
              onUpdateNode={updateNode}
              onDeleteNode={deleteNode}
              onUpdateEdge={updateEdge}
              onDeleteEdge={deleteEdge}
            />
            <MermaidPanel source={mermaidDraft} onChange={setMermaidDraft} onApply={applyMermaid} />
          </div>
        </div>
        {error ? <div className="toast error-text">{error}</div> : null}
      </div>
    </ReactFlowProvider>
  );
};

const detachFromNonContainerParent = (
  node: Node<FlowNodeData>,
  nodes: readonly Node<FlowNodeData>[],
  updatedNodeId: string,
  data: Partial<FlowNodeData>
): Node<FlowNodeData> => {
  if (!data.kind || node.parentId !== updatedNodeId || isContainerNodeKind(data.kind)) {
    return node;
  }

  return detachNodeFromParent(node, nodes);
};

const detachNodeFromParent = (
  node: Node<FlowNodeData>,
  nodes: readonly Node<FlowNodeData>[]
): Node<FlowNodeData> => {
  const position = getAbsolutePosition(node, nodes);

  return {
    ...node,
    parentId: undefined,
    position,
    data: {
      ...node.data,
      parentId: undefined,
      position
    }
  };
};

const getSizeForKind = (
  node: Node<FlowNodeData>,
  kind: FlowNodeData["kind"]
): Readonly<{ width: number; height: number }> => {
  const defaultSize = getDefaultNodeSize(kind);
  const currentSize = getNodeSize(node);

  return isContainerNodeKind(kind)
    ? {
        width: Math.max(currentSize.width, defaultSize.width),
        height: Math.max(currentSize.height, defaultSize.height)
      }
    : defaultSize;
};

const getAbsolutePosition = (
  node: Node<FlowNodeData>,
  nodes: readonly Node<FlowNodeData>[]
): Readonly<{ x: number; y: number }> => {
  if (!node.parentId) return node.position;
  const parent = nodes.find((candidate) => candidate.id === node.parentId);
  if (!parent) return node.position;
  const parentPosition = getAbsolutePosition(parent, nodes);

  return {
    x: parentPosition.x + node.position.x,
    y: parentPosition.y + node.position.y
  };
};

const getNodeSize = (
  node: Node<FlowNodeData>
): Readonly<{ width: number; height: number }> => ({
  width: node.measured?.width ?? node.width ?? node.data.size.width,
  height: node.measured?.height ?? node.height ?? node.data.size.height
});
